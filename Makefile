SHELL := /bin/bash
COMPOSE := docker compose -f infrastructure/docker-compose.yml

.PHONY: setup up down logs seed build reindex ps health

setup:
	bash infrastructure/scripts/mac_setup.sh

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f --tail=200

ps:
	$(COMPOSE) ps

seed:
	bash infrastructure/scripts/seed_samples.sh

reindex:
	bash infrastructure/scripts/create_indexes.sh

health:
	@curl -s http://localhost:8000/health | jq . || true

build:
	$(COMPOSE) build

# --- Tests ---
.PHONY: test.smoke test.retrieve test.generate test.multilingual test.perf test.resilience test.all

test.smoke:
	bash tests/test_smoke.sh

test.retrieve:
	bash tests/test_retrieval.sh

test.generate:
	bash tests/test_generate_sse.sh

test.multilingual:
	bash tests/test_multilingual.sh

test.perf:
	bash tests/test_performance.sh

test.resilience:
	bash tests/test_resilience.sh

test.all: test.smoke test.retrieve test.generate test.multilingual test.resilience
	@echo "All functional tests passed. (perf skipped)"
