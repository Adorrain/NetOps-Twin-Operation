"""配置文件存储与路径管理工具。

Author: Adorrain
Date: 2026-01-30
"""

import os


def get_backend_base_dir() -> str:
    """获取后端项目根目录路径。

    通过当前文件路径向上回溯，定位到 backend 目录的绝对路径。

    Returns:
        后端项目根目录的绝对路径。
    """
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def get_config_dir() -> str:
    """获取并确保配置目录存在。

    配置目录位于后端根目录下的 config/。若目录不存在则自动创建。

    Returns:
        配置目录的绝对路径。
    """
    base_dir = get_backend_base_dir()
    config_dir = os.path.join(base_dir, "config")
    os.makedirs(config_dir, exist_ok=True)
    return config_dir


def get_config_path(filename: str) -> str:
    """拼接配置文件的绝对路径。

    Args:
        filename: 配置文件名，例如 "campus.yaml"。

    Returns:
        配置文件的绝对路径。
    """
    return os.path.join(get_config_dir(), filename)


def write_bytes(path: str, content: bytes) -> None:
    """以二进制方式写入文件内容。

    Args:
        path: 目标文件路径。
        content: 需要写入的二进制内容。
    """
    with open(path, "wb") as buffer:
        buffer.write(content)
