# VERDICT - one entry point for setup, tests, lint and the offline demo.
#   make setup   create contracts/.venv + relayer/node_modules (pinned)
#   make test    contract tests (direct + static) + relayer tests
#   make lint    genvm-lint check + typecheck, relayer tsc --noEmit
#   make demo    one full case through the real relayer against the stand-in chain (no network)
#   make verify  everything above, with a PASS/FAIL summary (scripts/verify.sh)

PY      ?= python3
# genvm-lint validates against this GenVM release (pinned; see scripts/verify.sh)
export GENVM_VERSION ?= v0.2.16
VENV    := contracts/.venv
VPY     := $(VENV)/bin/python
VBIN    := $(VENV)/bin

.PHONY: setup test lint demo verify contract-test relayer-test fixtures digest clean

setup: $(VPY) relayer/node_modules

$(VPY): contracts/requirements.txt
	$(PY) -m venv $(VENV)
	$(VPY) -m pip install -q --upgrade pip
	$(VPY) -m pip install -q -r contracts/requirements.txt
	touch $(VPY)

relayer/node_modules: relayer/package-lock.json
	cd relayer && npm ci --no-audit --no-fund
	touch relayer/node_modules

contract-test: $(VPY)
	cd contracts && ../$(VPY) -m pytest -q

relayer-test: relayer/node_modules
	cd relayer && npm test

test: contract-test relayer-test

lint: setup
	cd contracts && PATH="$(CURDIR)/$(VBIN):$$PATH" ../$(VBIN)/genvm-lint check judge_router.py && PATH="$(CURDIR)/$(VBIN):$$PATH" ../$(VBIN)/genvm-lint typecheck judge_router.py
	cd relayer && npm run typecheck

demo: relayer/node_modules
	cd relayer && npm run demo

verify:
	bash scripts/verify.sh

fixtures: $(VPY)
	$(VPY) -I fixtures/generate.py

digest: relayer/node_modules
	cd relayer && npm run --silent contract-digest

clean:
	rm -rf $(VENV) relayer/node_modules relayer/dist relayer/dist-test relayer/dist-deploy relayer/data
