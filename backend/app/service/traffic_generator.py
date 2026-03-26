import math
import random
import time


class TrafficGenerator:
    def __init__(self):
        self.start_time = time.time()

        self.link = {
            "base_util": 0.5,
            "history": []
        }

    # 初始化（可选传cost）
    def start(self, cost=10):
        try:
            self.link["cost"] = max(1, int(cost))
        except Exception:
            self.link["cost"] = 10

    # 生成一次流量
    def step(self):
        t = int(time.time() - self.start_time)

        # 周期波动
        wave = 0.2 * math.sin(t / 5 )

        # 随机扰动
        noise = random.random() * 0.05

        # cost影响
        cost = self.link.get("cost", 10)
        try:
            cost = max(1, int(cost))
        except Exception:
            cost = 10

        util = (self.link["base_util"] + wave + noise) / cost

        # 限制范围
        util = max(0.05, min(0.95, util))

        # 存历史
        self.link["history"].append(util)
        if len(self.link["history"]) > 50:
            self.link["history"].pop(0)

        return util

    # 获取历史（给LSTM）
    def get_history(self, window=10):
        hist = self.link["history"]
        if len(hist) < window:
            return [0.5] * (window - len(hist)) + hist
        return hist[-window:]

    # 修改cost（可选）
    def set_cost(self, cost):
        self.link["cost"] = max(1, int(cost))