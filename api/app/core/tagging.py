import json
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel

# Path to the tag master JSON file
TAG_MASTER_PATH = Path(__file__).parent / "tag_master.json"

class TagMasterData(BaseModel):
    doc_types: List[str]
    topics: List[str]
    states: List[str]
    extras: List[str]

class TagMaster:
    _instance: Optional['TagMaster'] = None
    data: TagMasterData

    def __init__(self):
        if not TAG_MASTER_PATH.exists():
            raise FileNotFoundError(f"Tag master file not found at {TAG_MASTER_PATH}")
        
        with open(TAG_MASTER_PATH, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
            self.data = TagMasterData(**raw_data)

    @classmethod
    def get_instance(cls) -> 'TagMaster':
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def doc_types(self) -> List[str]:
        return self.data.doc_types

    @property
    def topics(self) -> List[str]:
        return self.data.topics

    @property
    def states(self) -> List[str]:
        return self.data.states

    @property
    def extras(self) -> List[str]:
        return self.data.extras

    def validate_tag(self, category: str, value: str) -> bool:
        if category == "doc_type":
            return value in self.data.doc_types
        if category == "topic":
            return value in self.data.topics
        if category == "state":
            return value in self.data.states
        if category == "extra":
            return value in self.data.extras
        return False
