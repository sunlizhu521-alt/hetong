from .storage import store


def main() -> None:
    removed = store.cleanup_expired()
    print(f"removed={removed}")


if __name__ == "__main__":
    main()
