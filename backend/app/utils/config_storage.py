import os


def get_backend_base_dir() -> str:
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def get_config_dir() -> str:
    base_dir = get_backend_base_dir()
    config_dir = os.path.join(base_dir, "config")
    os.makedirs(config_dir, exist_ok=True)
    return config_dir


def get_config_path(filename: str) -> str:
    return os.path.join(get_config_dir(), filename)


def write_bytes(path: str, content: bytes) -> None:
    with open(path, "wb") as buffer:
        buffer.write(content)
