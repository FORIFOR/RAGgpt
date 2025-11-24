#!/usr/bin/env python3
"""Manual Nextcloud -> RAG ingest trigger."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.app.integrations.nextcloud import build_runtime_from_env


async def _run(args: argparse.Namespace) -> int:
    runtime = build_runtime_from_env()
    if not runtime:
        print("NEXTCLOUD_WEBDAV_* env vars are not configured.", file=sys.stderr)
        return 2

    manager = runtime.manager
    if args.path:
        result = await manager.ingest_by_path(
            args.path,
            force=args.force,
            reason="cli",
        )
        print(result)
        return 0 if result.get("status") == "ingested" else 1

    result = await manager.scan_folder(folder=args.folder, force=args.force)
    print(f"Scanned {result['folder']}: {len(result['processed'])} files")
    for entry in result["processed"]:
        status = entry.get("status")
        path = entry.get("path")
        extra = entry.get("error") or entry.get("response")
        print(f"- {path}: {status} ({extra})")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Nextcloud /RAG folder into RAG backend.")
    parser.add_argument("--path", help="Specific Nextcloud path (/RAG/foo.pdf) to ingest")
    parser.add_argument("--folder", help="Override folder path (default: NEXTCLOUD_RAG_FOLDER)")
    parser.add_argument("--force", action="store_true", help="Re-upload even if ETag matches state")
    args = parser.parse_args()
    try:
        exit_code = asyncio.run(_run(args))
    except KeyboardInterrupt:
        exit_code = 130
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
