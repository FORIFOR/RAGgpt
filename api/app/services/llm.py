import json
import os
import httpx
from typing import Any, Dict, Optional
from ..core.tagging import TagMaster
from ..models.files import FileTags

class LLMService:
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o")

    async def classify_document(self, text: str, filename: str) -> FileTags:
        if not self.api_key:
            # Fallback or mock if no API key
            print("Warning: No OPENAI_API_KEY found. Returning empty tags.")
            return FileTags()

        tag_master = TagMaster.get_instance()
        
        prompt = f"""
You are an AI assistant for file organization.
Analyze the following document content and filename to assign tags based on the provided candidates.

Filename: {filename}
Content Snippet:
{text[:2000]}

Candidates:
- doc_types: {", ".join(tag_master.doc_types)}
- topics: {", ".join(tag_master.topics)}
- states: {", ".join(tag_master.states)}
- extras: {", ".join(tag_master.extras)}

Instructions:
1. Select ONE doc_type from the list. If none match, use null.
2. Select ONE topic from the list. If none match, use null.
3. Extract ONE entity (client name, project name) if present.
4. Select ONE state from the list. If none match, use null.
5. Select up to 2 extras from the list.

Output JSON format:
{{
  "doc_type": "string or null",
  "topic": "string or null",
  "entity": "string or null",
  "state": "string or null",
  "extras": ["string"]
}}
"""

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": "You are a helpful assistant that outputs JSON."},
                            {"role": "user", "content": prompt}
                        ],
                        "response_format": {"type": "json_object"},
                        "temperature": 0.1
                    }
                )
                response.raise_for_status()
                result = response.json()
                content = result["choices"][0]["message"]["content"]
                data = json.loads(content)
                
                return FileTags(
                    doc_type=data.get("doc_type"),
                    topic=data.get("topic"),
                    entity=data.get("entity"),
                    state=data.get("state"),
                    extras=data.get("extras", [])
                )
        except Exception as e:
            print(f"LLM classification failed: {e}")
            return FileTags()
