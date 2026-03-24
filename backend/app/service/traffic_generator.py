import math
import random
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional


class TrafficGenerator:
    def __init__(self):
        self.scenario_id: Optional[str] = None
        self.interval_seconds: int = 5
        self.seed: int = 20260321
        self.started_at: float = 0.0
        self.link_profiles: Dict[str, Dict] = {}
        self.link_costs: Dict[str, int] = {}
        self.link_base_costs: Dict[str, int] = {}
        self.link_history: Dict[str, List[float]] = {}
        self.forced_peak: Dict[str, Dict] = {}
        self.policy_state: Dict[str, Dict] = {}

    def start(self, topology, interval_seconds: int = 5, seed: int = 20260321) -> Dict:
        self.scenario_id = f"sc_{int(time.time())}"
        self.interval_seconds = max(1, interval_seconds)
        self.seed = seed
        self.started_at = time.time()
        self.link_profiles = {}
        self.link_costs = {}
        self.link_base_costs = {}
        self.link_history = {}
        self.forced_peak = {}
        self.policy_state = {}
        for idx, link in enumerate(topology.links):
            link_id = link.id
            cap = self._parse_capacity_mbps(link.bandwidth)
            base_cost = self._default_cost_from_bandwidth(link.bandwidth)
            current_cost = int(link.ospf_cost) if getattr(link, "ospf_cost", None) else base_cost
            self.link_profiles[link_id] = {
                "link_id": link_id,
                "src_device": link.src_device,
                "dst_device": link.dst_device,
                "capacity_mbps": cap,
                "base_util": 0.30 + (idx % 5) * 0.05,
                "phase": (idx % 8) * 0.6,
            }
            self.link_base_costs[link_id] = base_cost
            self.link_costs[link_id] = max(1, current_cost)
            self.link_history[link_id] = []
            self.policy_state[link_id] = {"low_streak": 0, "last_adjust_ts": 0.0}
        return {"scenario_id": self.scenario_id, "interval_seconds": self.interval_seconds, "link_count": len(self.link_profiles)}

    def has_scenario(self) -> bool:
        return bool(self.scenario_id and self.link_profiles)

    def ensure_started(self, topology):
        if not self.has_scenario():
            self.start(topology=topology)

    def ensure_link_ready(self, topology, link_id: str):
        self.ensure_started(topology)
        if link_id not in self.link_profiles:
            self.start(topology=topology, interval_seconds=self.interval_seconds, seed=self.seed)

    def apply_cost(self, link_id: str, new_cost: int) -> Dict:
        if link_id not in self.link_profiles:
            raise KeyError(f"link {link_id} not found")
        old_cost = self.link_costs.get(link_id, 1)
        self.link_costs[link_id] = max(1, int(new_cost))
        state = self.policy_state.setdefault(link_id, {"low_streak": 0, "last_adjust_ts": 0.0})
        state["low_streak"] = 0
        state["last_adjust_ts"] = time.time()
        return {"link_id": link_id, "old_cost": old_cost, "new_cost": self.link_costs[link_id]}

    def simulate_peak_for_link(self, topology, link_id: str) -> Dict:
        self.ensure_link_ready(topology, link_id)
        if link_id not in self.link_profiles:
            raise KeyError(f"link {link_id} not found")
        self.forced_peak[link_id] = {"started_at": time.time(), "duration_seconds": 86400, "target_utilization": 0.88}
        panel = self.get_link_panel_data(link_id, points=24)
        realtime = self.get_realtime()
        panel["realtime_link"] = next((item for item in realtime["links"] if item["link_id"] == link_id), None)
        return panel

    def get_realtime(self) -> Dict:
        if not self.has_scenario():
            raise RuntimeError("traffic scenario not started")
        now = time.time()
        tick = int((now - self.started_at) // self.interval_seconds)
        rows = []
        for link_id, profile in self.link_profiles.items():
            util = self._sample_utilization(link_id, profile, tick, now)
            mbps = round(profile["capacity_mbps"] * util, 2)
            level = self._peak_level(util)
            rows.append({
                "link_id": link_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "src_device": profile["src_device"],
                "dst_device": profile["dst_device"],
                "capacity_mbps": profile["capacity_mbps"],
                "current_mbps": mbps,
                "utilization": round(util, 4),
                "is_peak": level in ("high", "critical"),
                "peak_level": level,
                "current_cost": self.link_costs[link_id],
                "base_cost": self.link_base_costs[link_id],
            })
            hist = self.link_history[link_id]
            hist.append(mbps)
            if len(hist) > 60:
                del hist[: len(hist) - 60]
        return {"scenario_id": self.scenario_id, "links": rows}

    def get_link_panel_data(self, link_id: str, points: int = 24) -> Dict:
        if link_id not in self.link_profiles:
            raise KeyError(f"link {link_id} not found")
        profile = self.link_profiles[link_id]
        hist = list(self.link_history.get(link_id, []))
        if len(hist) < points:
            fill = profile["capacity_mbps"] * 0.45
            hist = [fill for _ in range(points - len(hist))] + hist
        return {"link_id": link_id, "series_mbps": [round(v, 2) for v in hist[-points:]], "current_cost": self.link_costs[link_id], "capacity_mbps": profile["capacity_mbps"]}

    def suggest_cost_for_link(self, topology, link_id: str) -> Dict:
        self.ensure_link_ready(topology, link_id)
        row = next((item for item in self.get_realtime()["links"] if item["link_id"] == link_id), None)
        if not row:
            raise KeyError(f"link {link_id} not found")
        current_cost = int(row["current_cost"])
        base_cost = int(row["base_cost"])
        util = float(row["utilization"])
        state = self.policy_state.setdefault(link_id, {"low_streak": 0, "last_adjust_ts": 0.0})
        now = time.time()
        cooldown_ok = (now - float(state.get("last_adjust_ts", 0.0))) >= 30.0
        rec = current_cost
        reason = "当前负载稳定，保持Cost不变"
        if util >= 0.9:
            state["low_streak"] = 0
            if cooldown_ok:
                rec = current_cost + 30
                reason = "链路利用率高于90%，建议显著提高Cost避峰"
                state["last_adjust_ts"] = now
            else:
                reason = "处于30秒冷却期，暂不重复提高Cost"
        elif util >= 0.8:
            state["low_streak"] = 0
            if cooldown_ok:
                rec = current_cost + 20
                reason = "链路利用率高于80%，建议提高Cost避峰"
                state["last_adjust_ts"] = now
            else:
                reason = "处于30秒冷却期，暂不重复提高Cost"
        elif util >= 0.75:
            state["low_streak"] = 0
            if cooldown_ok:
                rec = current_cost + 10
                reason = "链路接近拥塞，建议小幅提高Cost"
                state["last_adjust_ts"] = now
            else:
                reason = "处于30秒冷却期，暂不重复提高Cost"
        elif util < 0.60 and current_cost > base_cost:
            state["low_streak"] = int(state.get("low_streak", 0)) + 1
            if state["low_streak"] >= 3 and cooldown_ok:
                rec = max(base_cost, current_cost - 5)
                reason = "连续3个周期低于60%，建议小幅回调Cost"
                state["last_adjust_ts"] = now
                state["low_streak"] = 0
            elif state["low_streak"] >= 3:
                reason = "已满足3周期低负载，但处于30秒冷却期，暂不回调Cost"
            else:
                reason = f"低负载计数 {state['low_streak']}/3，等待满足回调条件"
        else:
            state["low_streak"] = 0
        return {
            "link_id": link_id,
            "current_cost": current_cost,
            "recommended_cost": int(max(1, min(65535, rec))),
            "current_mbps": float(row["current_mbps"]),
            "current_utilization": util,
            "reason": reason,
        }

    def _sample_utilization(self, link_id: str, profile: Dict, tick: int, now: float) -> float:
        base_util = profile["base_util"]
        phase = profile["phase"]
        daily_wave = 0.18 * math.sin((tick / 24.0) + phase)
        noise = (random.Random(self.seed + tick * 13 + len(link_id)).random() - 0.5) * 0.04
        base_cost = max(1, self.link_base_costs.get(link_id, 1))
        current_cost = max(1, self.link_costs.get(link_id, base_cost))
        cost_factor = max(0.5, min(1.2, base_cost / current_cost))
        util = (base_util + daily_wave + noise) * cost_factor
        peak = self.forced_peak.get(link_id)
        if peak:
            elapsed = now - peak["started_at"]
            if 0 <= elapsed <= peak["duration_seconds"]:
                util = max(util, float(peak["target_utilization"]))
        return max(0.05, min(util, 0.97))

    def _peak_level(self, util: float) -> str:
        if util >= 0.9:
            return "critical"
        if util >= 0.75:
            return "high"
        if util >= 0.6:
            return "busy"
        return "normal"

    def _default_cost_from_bandwidth(self, bandwidth: Optional[str]) -> int:
        cap = self._parse_capacity_mbps(bandwidth)
        return max(1, int(round(1000.0 / max(1.0, cap))))

    def _parse_capacity_mbps(self, bandwidth: Optional[str]) -> float:
        if not bandwidth:
            return 1000.0
        text = str(bandwidth).strip().lower()
        try:
            if text.endswith("g"):
                return max(1.0, float(text[:-1]) * 1000.0)
            if text.endswith("m"):
                return max(1.0, float(text[:-1]))
            return max(1.0, float(text))
        except ValueError:
            return 1000.0


traffic_generator = TrafficGenerator()
