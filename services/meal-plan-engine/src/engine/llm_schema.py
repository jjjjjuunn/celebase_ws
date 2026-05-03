"""Pydantic schemas for LLM output validation — spec.md §5.8, LLM-DESIGN.md §S6."""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator

__all__ = [
    "CitationSource",
    "Citation",
    "LlmRankedMeal",
    "LlmRankedMealList",
    "LlmProvenance",
    "LlmRerankResult",
]


class CitationSource(str, Enum):
    CELEBRITY_INTERVIEW = "celebrity_interview"
    COOKBOOK = "cookbook"
    CLINICAL_STUDY = "clinical_study"
    USDA_DB = "usda_db"
    NIH_STANDARD = "nih_standard"


class Citation(BaseModel):
    source_type: CitationSource
    title: str = Field(min_length=1, max_length=200)
    url: Optional[str] = None
    celeb_persona: Optional[str] = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def check_url_or_celeb(self) -> "Citation":
        if self.url is None and self.celeb_persona is None:
            raise ValueError("url 또는 celeb_persona 중 하나 필수 (LLM-DESIGN §S6)")
        return self


class LlmRankedMeal(BaseModel):
    recipe_id: str = Field(min_length=1)
    rank: int = Field(ge=1, le=50)
    narrative: str = Field(min_length=10, max_length=300)
    # min_length=1 — 출처 0건은 spec §5.8 "black-box" 금지에 위반 (LLM-DESIGN §S6)
    citations: list[Citation] = Field(min_length=1)


class LlmRankedMealList(BaseModel):
    meals: list[LlmRankedMeal] = Field(min_length=1)
    mode: str = Field(pattern=r"^(llm|standard)$")


class LlmProvenance(BaseModel):
    """LLM 호출 감사 정보 — meal_plans.adjustments.llm_provenance에 저장 (LLM-DESIGN §S12)."""

    model: str
    prompt_hash: str   # sha256 hexdigest[:16] of rendered system+user prompt
    output_hash: str   # sha256 hexdigest[:16] of raw LLM response
    mode: str          # "llm" | "standard"


class LlmRerankResult(BaseModel):
    """llm_reranker.llm_rerank_and_narrate() 반환값 (LLM-DESIGN §S3)."""

    ranked_plan: list[Any]          # List[List[RecipeSlot]] — circular import 회피
    mode: str                       # "llm" | "standard"
    quota_exceeded: bool = False
    provenance: Optional[LlmProvenance] = None
