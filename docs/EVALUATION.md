# Evaluation

Create a small regression set (15–50 questions) targeting your own documents. Track:
- Hit@k: proportion of queries where at least one relevant chunk appears in top-k.
- Citation rate: answers include at least one relevant citation.
- Irrelevant rate: answers marked as insufficient when context is missing.
- Latency p95: end-to-end chat latency at p95.
- Token usage: input/output tokens per request.

CLI sketch (pseudo):
```bash
# Provide questions.jsonl: {"q": "...", "tenant": "default", "k": 8}
while read -r line; do
  q=$(echo "$line" | jq -r .q)
  curl -s -X POST "$API_BASE/search" -H 'x-api-key: $API_KEY' \
    -H 'Content-Type: application/json' -d "{\"query\":$q}" | jq .
done < questions.jsonl
```

AB tests: vary `HYBRID_ALPHA`, `HYBRID_K1/K2`, rerank ON/OFF, and chunk length to assess impact.

