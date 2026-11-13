.PHONY: up down logs

up:
	docker compose up --build -d
	@echo "OrbitPass running at http://localhost:8080"

down:
	docker compose down

logs:
	docker compose logs -f
