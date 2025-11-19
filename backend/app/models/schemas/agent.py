"""Agent configuration schemas for API validation."""

from typing import Optional, Dict, List, Any
from pydantic import BaseModel, Field


class AgentConfigurationBase(BaseModel):
    """Base agent configuration schema."""
    agent_type: str = Field(default="code_agent", description="Type of agent template")
    system_instructions: Optional[str] = Field(default=None, description="Custom system instructions")
    environment_type: str = Field(default="python3.11", description="Environment type (python3.11, node20, etc.)")
    environment_config: Dict[str, Any] = Field(default_factory=dict, description="Environment configuration (packages, env vars)")
    enabled_tools: List[str] = Field(default_factory=list, description="List of enabled tool names")
    llm_provider: str = Field(default="openai", description="LLM provider (openai, anthropic, azure, etc.)")
    llm_model: str = Field(default="gpt-4", description="LLM model name")
    llm_config: Dict[str, Any] = Field(default_factory=dict, description="LLM configuration (temperature, max_tokens, etc.)")


class AgentConfigurationUpdate(BaseModel):
    """Schema for updating agent configuration."""
    agent_type: Optional[str] = None
    system_instructions: Optional[str] = None
    environment_type: Optional[str] = None
    environment_config: Optional[Dict[str, Any]] = None
    enabled_tools: Optional[List[str]] = None
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    llm_config: Optional[Dict[str, Any]] = None


class AgentConfigurationResponse(AgentConfigurationBase):
    """Schema for agent configuration response."""
    id: str
    project_id: str

    class Config:
        from_attributes = True
