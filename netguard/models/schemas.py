"""
NetGuard Data Models
"""

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, field_validator
import re


def normalize_mac(mac: str) -> str:
    clean = re.sub(r'[^0-9a-fA-F]', '', mac)
    if len(clean) != 12:
        raise ValueError(f"Invalid MAC address: {mac}")
    return ':'.join(clean[i:i+2].upper() for i in range(0, 12, 2))


class DeviceCreate(BaseModel):
    name: str
    mac: str
    owner: str
    allocated_minutes: int = 60

    @field_validator('mac')
    @classmethod
    def validate_mac(cls, v):
        try:
            return normalize_mac(v)
        except ValueError as e:
            raise ValueError(str(e))

    @field_validator('allocated_minutes')
    @classmethod
    def validate_minutes(cls, v):
        if v < 1:
            raise ValueError("must be at least 1")
        if v > 14400:
            raise ValueError("cannot exceed 14400")
        return v

    @field_validator('name', 'owner')
    @classmethod
    def validate_non_empty(cls, v):
        if not v.strip():
            raise ValueError("cannot be empty")
        return v.strip()[:64]


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    owner: Optional[str] = None
    allocated_minutes: Optional[int] = None


class Device(BaseModel):
    id: str
    name: str
    mac: str
    owner: str
    allocated_minutes: int
    used_minutes: int
    status: str
    added_at: str
    last_seen: Optional[str] = None
    ip_address: Optional[str] = None


class RouterConfigUpdate(BaseModel):
    host: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None


class ActionResponse(BaseModel):
    success: bool
    message: str
    data: Optional[dict] = None


class BulkActionRequest(BaseModel):
    device_ids: list
    action: str
