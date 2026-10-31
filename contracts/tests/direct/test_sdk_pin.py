"""The direct tier must run on the pinned GenVM SDK, never on "latest" (CI root cause, 2026-10-31).

On a fresh runner ~/.cache/gltest-direct is empty, and an unpinned gltest
asks GitHub for the newest GenVM release. This test makes "latest" a release
that does not exist and the cache look empty: only a pinned deploy survives.
"""

import sys

from gltest.direct import sdk_loader

from conftest import CONTRACT, GENVM_VERSION


def test_direct_mode_loads_the_pinned_genvm_sdk(direct_vm, direct_deploy, direct_alice, monkeypatch):
    def no_latest():
        raise AssertionError("direct mode asked GitHub for the latest GenVM release: the SDK version is not pinned")

    monkeypatch.setattr(sdk_loader, "get_latest_version", no_latest)
    monkeypatch.setattr(sdk_loader, "list_cached_versions", lambda: ["v0.0.0-not-the-pin"])
    direct_vm.sender = direct_alice
    direct_deploy(CONTRACT)
    sdk_paths = [p for p in sys.path if "gltest-direct" in p]
    assert sdk_paths, "direct mode added no SDK paths"
    assert all(f"/{GENVM_VERSION}/" in p or p.endswith(f"/{GENVM_VERSION}") for p in sdk_paths), sdk_paths
