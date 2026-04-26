import argparse
import json
import logging
import mimetypes
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import requests


def load_dotenv_file(file_path: Path) -> None:
    if not file_path.exists():
        return

    for raw_line in file_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if not key or key in os.environ:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"\"", "'"}:
            value = value[1:-1]

        os.environ[key] = value


load_dotenv_file(Path(__file__).resolve().with_name(".env"))


DEFAULT_BASE_URL = os.getenv("PRODUCT_IMPORT_BASE_URL", "https://api.ordonsooq.com/api").rstrip("/")
DEFAULT_OPENAI_MODEL = os.getenv("PRODUCT_IMPORT_OPENAI_MODEL", "gpt-5.4")
DEFAULT_TIMEOUT_SECONDS = 120
DEFAULT_OPENAI_LOG_PATH = Path(
    os.getenv(
        "PRODUCT_IMPORT_OPENAI_LOG_PATH",
        str(Path(__file__).resolve().parent / "logs" / "import_product_openai.jsonl"),
    ),
)
NOT_EXIST = "not_exist"
NUMERIC_TOKEN_PATTERN = re.compile(r"\d+(?:\.\d+)?")


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


def normalize_auth_token(token: str) -> str:
    normalized = token.strip()
    if not normalized:
        raise ValueError("Auth token is empty. Set PRODUCT_IMPORT_AUTH_TOKEN or pass --auth-token.")
    if normalized.lower().startswith("bearer "):
        return normalized
    return f"Bearer {normalized}"


def get_session_base_url(session: requests.Session) -> str:
    return getattr(session, "base_url", DEFAULT_BASE_URL)


def unwrap_data(body: Any, url: str) -> Any:
    if not isinstance(body, dict) or "data" not in body:
        raise ValueError(f"Missing 'data' key in response from {url}: {body}")
    return body["data"]


def make_session(auth_token: str | None = None, base_url: str = DEFAULT_BASE_URL) -> requests.Session:
    token = auth_token or os.getenv("PRODUCT_IMPORT_AUTH_TOKEN")
    if not token:
        raise ValueError(
            "Missing auth token. Set PRODUCT_IMPORT_AUTH_TOKEN or pass --auth-token.",
        )

    session = requests.Session()
    session.base_url = base_url.rstrip("/")
    session.headers.update(
        {
            "Authorization": normalize_auth_token(token),
            "Accept": "application/json",
        },
    )
    return session


def api_get(
    session: requests.Session,
    endpoint: str,
    params: dict[str, Any] | None = None,
) -> Any:
    url = f"{get_session_base_url(session)}/{endpoint.lstrip('/')}"
    log.info("GET %s params=%s", url, params)
    response = session.get(url, params=params, timeout=DEFAULT_TIMEOUT_SECONDS)
    response.raise_for_status()
    return unwrap_data(response.json(), url)


def api_patch(session: requests.Session, endpoint: str, payload: dict[str, Any]) -> Any:
    url = f"{get_session_base_url(session)}/{endpoint.lstrip('/')}"
    log.info("PATCH %s", url)
    response = session.patch(url, json=payload, timeout=DEFAULT_TIMEOUT_SECONDS)
    response.raise_for_status()
    return unwrap_data(response.json(), url)


def api_post(
    session: requests.Session,
    endpoint: str,
    payload: dict[str, Any],
) -> Any:
    url = f"{get_session_base_url(session)}/{endpoint.lstrip('/')}"
    log.info("POST %s", url)
    response = session.post(url, json=payload, timeout=DEFAULT_TIMEOUT_SECONDS)
    response.raise_for_status()
    return unwrap_data(response.json(), url)


def api_post_multipart_form(
    session: requests.Session,
    endpoint: str,
    fields: dict[str, Any],
) -> Any:
    url = f"{get_session_base_url(session)}/{endpoint.lstrip('/')}"
    log.info("POST %s (multipart form)", url)

    multipart_fields: list[tuple[str, tuple[None, str]]] = []
    for key, value in fields.items():
        if value is None:
            continue
        if isinstance(value, bool):
            serialized_value = "true" if value else "false"
        elif isinstance(value, (list, dict)):
            serialized_value = json.dumps(value, ensure_ascii=False)
        else:
            serialized_value = str(value)
        multipart_fields.append((key, (None, serialized_value)))

    response = session.post(url, files=multipart_fields, timeout=DEFAULT_TIMEOUT_SECONDS)
    response.raise_for_status()
    return unwrap_data(response.json(), url)


def api_post_file(
    session: requests.Session,
    endpoint: str,
    field_name: str,
    filename: str,
    content: bytes,
    content_type: str,
) -> Any:
    url = f"{get_session_base_url(session)}/{endpoint.lstrip('/')}"
    log.info("POST %s (multipart)", url)
    files = {
        field_name: (filename, content, content_type),
    }
    response = session.post(url, files=files, timeout=DEFAULT_TIMEOUT_SECONDS)
    response.raise_for_status()
    return unwrap_data(response.json(), url)


def extract_paginated_list(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        return data["data"]
    raise ValueError(f"Expected a list response but received: {data}")


def normalize_input_collection(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        if not value:
            return []
        return [
            {
                "name": key,
                "value": item_value,
            }
            for key, item_value in value.items()
        ]
    return [value]


def validate_input_data(data: dict[str, Any]) -> None:
    missing_fields = [
        field_name
        for field_name in ("title", "description", "new_price")
        if data.get(field_name) in (None, "")
    ]
    if missing_fields:
        raise ValueError(
            "Input JSON is missing required fields after normalization: "
            + ", ".join(missing_fields),
        )


def normalize_input_data(raw_data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw_data, dict):
        raise ValueError("Input JSON must be an object.")

    nested_data = raw_data.get("data")
    normalized = dict(raw_data)
    if isinstance(nested_data, dict):
        normalized.update(nested_data)

    if not normalized.get("reference_link") and raw_data.get("reference_link"):
        normalized["reference_link"] = raw_data.get("reference_link")

    normalized["attributes"] = normalize_input_collection(
        normalized.get("attributes"),
    )
    normalized["specification"] = normalize_input_collection(
        normalized.get("specification"),
    )

    validate_input_data(normalized)
    return normalized


def normalize_lookup_text(value: str) -> str:
    return "".join(character for character in value.casefold() if character.isalnum())


def extract_numeric_signature(value: str) -> tuple[str, ...]:
    return tuple(NUMERIC_TOKEN_PATTERN.findall(value.replace(",", "")))


def extract_simple_text(value: Any) -> str:
    if isinstance(value, str):
        normalized = value.strip()
        if normalized:
            return normalized

    if isinstance(value, dict):
        for key in ("name_en", "value_en", "name", "value", "name_ar", "value_ar"):
            candidate = str(value.get(key, "")).strip()
            if candidate:
                return candidate

    raise ValueError(f"AI returned an empty attribute/specification value: {value}")


def extract_localized_value(value: Any) -> tuple[str, str]:
    if isinstance(value, dict):
        name_en = str(
            value.get("name_en")
            or value.get("value_en")
            or value.get("name")
            or value.get("value")
            or "",
        ).strip()
        name_ar = str(value.get("name_ar") or value.get("value_ar") or name_en).strip() or name_en
        if name_en:
            return name_en, name_ar

    normalized = extract_simple_text(value)
    return normalized, normalized


def dedupe_non_empty_strings(values: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped


def extract_definition_units(definition: dict[str, Any] | None) -> list[str]:
    if not definition:
        return []

    return dedupe_non_empty_strings(
        [
            str(definition.get("unit_en", "")).strip(),
            str(definition.get("unit_ar", "")).strip(),
        ],
    )


def has_defined_unit(definition: dict[str, Any] | None) -> bool:
    return bool(extract_definition_units(definition))


def build_specification_value_candidates(
    specification: dict[str, Any] | None,
    matched_value: dict[str, Any],
) -> list[str]:
    base_candidates = dedupe_non_empty_strings(
        [
            str(matched_value.get("value_en", "")).strip(),
            str(matched_value.get("value_ar", "")).strip(),
        ],
    )

    if not specification:
        return base_candidates

    unit_candidates = extract_definition_units(specification)
    if not unit_candidates:
        return base_candidates

    with_units = [
        f"{base_candidate} {unit_candidate}"
        for base_candidate in base_candidates
        for unit_candidate in unit_candidates
    ]
    return dedupe_non_empty_strings(base_candidates + with_units)


def build_attribute_value_candidates(
    attribute: dict[str, Any] | None,
    matched_value: dict[str, Any],
) -> list[str]:
    base_candidates = dedupe_non_empty_strings(
        [
            str(matched_value.get("value_en", "")).strip(),
            str(matched_value.get("value_ar", "")).strip(),
        ],
    )

    unit_candidates = extract_definition_units(attribute)
    if not unit_candidates:
        return base_candidates

    with_units = [
        f"{base_candidate} {unit_candidate}"
        for base_candidate in base_candidates
        for unit_candidate in unit_candidates
    ]
    return dedupe_non_empty_strings(base_candidates + with_units)


def analyze_approximate_match(
    raw_candidates: list[str],
    matched_candidates: list[str],
) -> tuple[bool, str]:
    normalized_matched_candidates = {
        normalize_lookup_text(candidate)
        for candidate in matched_candidates
        if candidate.strip()
    }
    matched_numeric_signatures = {
        extract_numeric_signature(candidate)
        for candidate in matched_candidates
        if candidate.strip()
    }

    has_measurable_raw_value = False
    for raw_candidate in raw_candidates:
        normalized_raw_candidate = raw_candidate.strip()
        if not normalized_raw_candidate:
            continue

        if normalize_lookup_text(normalized_raw_candidate) in normalized_matched_candidates:
            return False, "raw value matches an existing database value after normalization"

        raw_numeric_signature = extract_numeric_signature(normalized_raw_candidate)
        if raw_numeric_signature:
            has_measurable_raw_value = True
            if raw_numeric_signature in matched_numeric_signatures:
                return False, "raw value matches an existing database numeric signature"

    if has_measurable_raw_value:
        return True, "raw measurable value differs from all existing unit-based database values"

    return False, "raw value has no measurable token; approximate numeric safeguard not applied"


def should_replace_approximate_match(
    raw_candidates: list[str],
    matched_candidates: list[str],
) -> bool:
    should_replace, _ = analyze_approximate_match(raw_candidates, matched_candidates)
    return should_replace


def append_openai_log(entry: dict[str, Any], log_path: Path = DEFAULT_OPENAI_LOG_PATH) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(entry, ensure_ascii=False) + "\n")


def build_openai_log_entry(
    *,
    model: str,
    openai_input: list[dict[str, Any]],
    raw_product_input: dict[str, Any],
    source_file: str | None,
    response: Any = None,
    raw_output_text: str | None = None,
    parsed_output: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> dict[str, Any]:
    response_dump: Any = None
    if response is not None:
        if hasattr(response, "model_dump"):
            response_dump = response.model_dump()
        else:
            response_dump = str(response)

    return {
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "source_file": source_file,
        "model": model,
        "raw_product_input": raw_product_input,
        "openai_input": openai_input,
        "openai_response": response_dump,
        "raw_output_text": raw_output_text,
        "parsed_output": parsed_output,
        "error": error_message,
    }


def resolve_brand_id(brands: list[dict[str, Any]], brand_name: str) -> int:
    normalized_brand_name = normalize_lookup_text(brand_name.strip())
    matches = [
        brand
        for brand in brands
        if normalized_brand_name
        and normalized_brand_name
        in {
            normalize_lookup_text(str(brand.get("name_en", ""))),
            normalize_lookup_text(str(brand.get("name_ar", ""))),
        }
    ]
    if not matches:
        available = [brand.get("name_en") for brand in brands]
        raise ValueError(
            f"Brand '{brand_name}' not found in database. Available brands include: {available}",
        )
    return int(matches[0]["id"])


def detect_brand_name_from_text(
    brands: list[dict[str, Any]],
    data: dict[str, Any],
) -> str | None:
    searchable_text = " ".join(
        str(data.get(field, ""))
        for field in ("title", "description", "reference_link")
    )
    normalized_text = normalize_lookup_text(searchable_text)
    if not normalized_text:
        return None

    candidates = sorted(
        (
            str(brand.get("name_en", "")).strip()
            for brand in brands
            if str(brand.get("name_en", "")).strip()
        ),
        key=len,
        reverse=True,
    )
    for candidate in candidates:
        if normalize_lookup_text(candidate) in normalized_text:
            return candidate
    return None


def resolve_optional_brand_id(
    brands: list[dict[str, Any]],
    data: dict[str, Any],
    ai_brand_name: Any,
) -> tuple[int | None, str | None]:
    source_brand_name = str(data.get("brand", "")).strip() or None
    detected_brand_name = detect_brand_name_from_text(brands, data)
    ai_brand_name_str = str(ai_brand_name).strip() if isinstance(ai_brand_name, str) else None

    for candidate_brand_name in (source_brand_name, detected_brand_name, ai_brand_name_str):
        if not candidate_brand_name:
            continue
        try:
            return resolve_brand_id(brands, candidate_brand_name), candidate_brand_name
        except ValueError:
            continue

    return None, None


def create_brand(session: requests.Session, brand_name: str) -> tuple[int, str]:
    normalized_brand_name = brand_name.strip()
    if not normalized_brand_name:
        raise ValueError("Brand name is empty.")

    created = api_post_multipart_form(
        session,
        "brands",
        {
            "name_en": normalized_brand_name,
            "name_ar": normalized_brand_name,
        },
    )
    created_name = str(created.get("name_en", normalized_brand_name)).strip() or normalized_brand_name
    return int(created["id"]), created_name


def resolve_or_create_brand_id(
    session: requests.Session,
    brands: list[dict[str, Any]],
    data: dict[str, Any],
    ai_brand_name: Any,
) -> tuple[int | None, str | None, bool]:
    brand_id, resolved_brand_name = resolve_optional_brand_id(brands, data, ai_brand_name)
    if brand_id is not None:
        return brand_id, resolved_brand_name, False

    source_brand_name = str(data.get("brand", "")).strip()
    if not source_brand_name:
        return None, None, False

    try:
        created_brand_id, created_brand_name = create_brand(session, source_brand_name)
        brands.append(
            {
                "id": created_brand_id,
                "name_en": created_brand_name,
                "name_ar": source_brand_name,
            },
        )
        return created_brand_id, created_brand_name, True
    except requests.HTTPError:
        refreshed_brands = extract_paginated_list(api_get(session, "brands", {"limit": 1000}))
        refreshed_brand_id, refreshed_brand_name = resolve_optional_brand_id(
            refreshed_brands,
            data,
            ai_brand_name,
        )
        if refreshed_brand_id is not None:
            return refreshed_brand_id, refreshed_brand_name, False
        raise


def create_specification_value(
    session: requests.Session,
    specification_id: int,
    value_en: str,
    value_ar: str,
) -> int:
    created = api_post(
        session,
        f"specifications/{specification_id}/values",
        {
            "value_en": value_en,
            "value_ar": value_ar,
        },
    )
    return int(created["id"])


def create_attribute_value(
    session: requests.Session,
    attribute_id: int,
    value_en: str,
    value_ar: str,
) -> int:
    created = api_post(
        session,
        f"attributes/{attribute_id}/values",
        {
            "value_en": value_en,
            "value_ar": value_ar,
        },
    )
    return int(created["id"])


def resolve_specifications(
    session: requests.Session,
    ai_specifications: list[dict[str, Any]],
    available_specifications: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    resolved: list[dict[str, Any]] = []
    specification_lookup = {
        int(specification["id"]): specification
        for specification in available_specifications
        if specification.get("id") is not None
    }

    for specification in ai_specifications:
        specification_id = int(specification["specification_id"])
        resolved_value_ids: list[int] = []
        matched_specification = specification_lookup.get(specification_id)
        value_lookup = {
            int(value["id"]): value
            for value in matched_specification.get("values", [])
            if matched_specification and value.get("id") is not None
        }

        for value in specification.get("values", []):
            matched_id = value.get("matched_value_id")
            original_value_en, original_value_ar = extract_localized_value(value.get("original_value"))

            if matched_id not in (NOT_EXIST, None):
                matched_id = int(matched_id)
                matched_value = value_lookup.get(matched_id)
                if matched_value is None:
                    log.info(
                        "Specification %s: AI returned unknown value id=%s for '%s'; creating new value.",
                        specification_id,
                        matched_id,
                        original_value_en,
                    )
                    matched_id = NOT_EXIST
                else:
                    unit_defined = has_defined_unit(matched_specification)
                    matched_candidates = build_specification_value_candidates(
                        matched_specification,
                        matched_value,
                    )

                    if unit_defined:
                        should_replace, decision_reason = analyze_approximate_match(
                            [original_value_en, original_value_ar],
                            matched_candidates,
                        )
                        if should_replace:
                            log.info(
                                "Specification %s: rejecting approximate match id=%s for raw value '%s'; creating exact value (%s).",
                                specification_id,
                                matched_id,
                                original_value_en,
                                decision_reason,
                            )
                            matched_id = NOT_EXIST
                        else:
                            log.info(
                                "Specification %s: keeping matched value id=%s for raw value '%s' (%s).",
                                specification_id,
                                matched_id,
                                original_value_en,
                                decision_reason,
                            )
                    else:
                        log.info(
                            "Specification %s: keeping matched value id=%s for raw value '%s' (no unit defined; approximate numeric safeguard not applied).",
                            specification_id,
                            matched_id,
                            original_value_en,
                        )

            if matched_id == NOT_EXIST:
                log.info(
                    "Specification %s: creating missing value '%s'.",
                    specification_id,
                    original_value_en,
                )
                matched_id = create_specification_value(
                    session,
                    specification_id,
                    original_value_en,
                    original_value_ar,
                )
                log.info(
                    "Specification %s: created value id=%s",
                    specification_id,
                    matched_id,
                )

            if matched_id != NOT_EXIST and matched_id is not None:
                resolved_value_ids.append(int(matched_id))

        clean_ids = sorted(set(resolved_value_ids))
        if clean_ids:
            resolved.append(
                {
                    "specification_id": specification_id,
                    "specification_value_ids": clean_ids,
                },
            )

    return resolved


def resolve_attributes(
    session: requests.Session,
    ai_attributes: list[dict[str, Any]],
    available_attributes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    resolved: list[dict[str, Any]] = []
    attribute_lookup = {
        int(attribute["id"]): attribute
        for attribute in available_attributes
        if attribute.get("id") is not None
    }

    for attribute in ai_attributes:
        attribute_id = int(attribute["attribute"]["attribute_id"])
        resolved_value_ids: list[int] = []
        matched_attribute = attribute_lookup.get(attribute_id)
        value_lookup = {
            int(value["id"]): value
            for value in matched_attribute.get("values", [])
            if matched_attribute and value.get("id") is not None
        }

        for value in attribute.get("values", []):
            matched_id = value.get("matched_value_id")
            original_value_text = extract_simple_text(value.get("original_value"))

            if matched_id not in (NOT_EXIST, None):
                matched_id = int(matched_id)
                matched_value = value_lookup.get(matched_id)
                if matched_value is None:
                    log.info(
                        "Attribute %s: AI returned unknown value id=%s for '%s'; creating new value.",
                        attribute_id,
                        matched_id,
                        original_value_text,
                    )
                    matched_id = NOT_EXIST
                else:
                    unit_defined = has_defined_unit(matched_attribute)
                    matched_candidates = build_attribute_value_candidates(
                        matched_attribute,
                        matched_value,
                    )

                    if unit_defined:
                        should_replace, decision_reason = analyze_approximate_match(
                            [original_value_text],
                            matched_candidates,
                        )
                        if should_replace:
                            log.info(
                                "Attribute %s: rejecting approximate match id=%s for raw value '%s'; creating exact value (%s).",
                                attribute_id,
                                matched_id,
                                original_value_text,
                                decision_reason,
                            )
                            matched_id = NOT_EXIST
                        else:
                            log.info(
                                "Attribute %s: keeping matched value id=%s for raw value '%s' (%s).",
                                attribute_id,
                                matched_id,
                                original_value_text,
                                decision_reason,
                            )
                    else:
                        log.info(
                            "Attribute %s: keeping matched value id=%s for raw value '%s' (no unit defined; approximate numeric safeguard not applied).",
                            attribute_id,
                            matched_id,
                            original_value_text,
                        )

            if matched_id == NOT_EXIST:
                log.info(
                    "Attribute %s: creating missing value '%s'.",
                    attribute_id,
                    original_value_text,
                )
                matched_id = create_attribute_value(
                    session,
                    attribute_id,
                    original_value_text,
                    original_value_text,
                )
                log.info(
                    "Attribute %s: created value id=%s",
                    attribute_id,
                    matched_id,
                )

            if matched_id != NOT_EXIST and matched_id is not None:
                resolved_value_ids.append(int(matched_id))

        clean_ids = sorted(set(resolved_value_ids))
        if clean_ids:
            resolved.append(
                {
                    "attribute_id": attribute_id,
                    "attribute_value_ids": clean_ids,
                },
            )

    return resolved


def build_upload_filename(image_url: str, content_type: str) -> str:
    parsed = urlparse(image_url)
    raw_name = Path(unquote(parsed.path)).name
    if raw_name and "." in raw_name:
        return raw_name

    guessed_ext = mimetypes.guess_extension(content_type) or ".jpg"
    return f"imported-image{guessed_ext}"


def download_image(session: requests.Session, image_url: str) -> int:
    log.info("Downloading image %s", image_url)
    response = requests.get(image_url, timeout=DEFAULT_TIMEOUT_SECONDS)
    response.raise_for_status()
    content_type = response.headers.get("Content-Type", "application/octet-stream").split(";", 1)[0]
    filename = build_upload_filename(image_url, content_type)
    media = api_post_file(
        session,
        "media/upload",
        "file",
        filename,
        response.content,
        content_type,
    )
    return int(media["id"])


def parse_media_reference(media_reference: Any) -> tuple[str, int | str] | None:
    if media_reference is None:
        return None
    if isinstance(media_reference, int):
        return "id", media_reference
    if isinstance(media_reference, str):
        stripped = media_reference.strip()
        if not stripped or stripped.lower() == "none":
            return None
        if stripped.isdigit():
            return "id", int(stripped)
        return "url", stripped
    if isinstance(media_reference, dict):
        if media_reference.get("media_id") is not None:
            return parse_media_reference(media_reference.get("media_id"))
        if media_reference.get("url") is not None:
            return parse_media_reference(media_reference.get("url"))
        if media_reference.get("id") is not None:
            return parse_media_reference(media_reference.get("id"))
    return None


def resolve_media_id(session: requests.Session, media_reference: Any) -> tuple[int, str]:
    parsed_reference = parse_media_reference(media_reference)
    if parsed_reference is None:
        raise ValueError(f"Unsupported media reference: {media_reference}")

    reference_kind, reference_value = parsed_reference
    if reference_kind == "id":
        media_id = int(reference_value)
        log.info("Using existing media id %s", media_id)
        return media_id, f"id:{media_id}"

    media_url = str(reference_value)
    return download_image(session, media_url), f"url:{media_url}"


def build_media(session: requests.Session, data: dict[str, Any]) -> list[dict[str, Any]]:
    ordered_media_sources: list[Any] = []
    if data.get("image") is not None:
        ordered_media_sources.append(data.get("image"))
    ordered_media_sources.extend(normalize_input_collection(data.get("images")))

    if not ordered_media_sources:
        raise ValueError("Input data must include 'image' or a non-empty 'images' array.")

    media: list[dict[str, Any]] = []
    seen_references: set[str] = set()
    for media_source in ordered_media_sources:
        try:
            media_id, reference_key = resolve_media_id(session, media_source)
        except ValueError:
            continue

        if reference_key in seen_references:
            continue
        seen_references.add(reference_key)

        media.append(
            {
                "media_id": media_id,
                "is_primary": len(media) == 0,
                "sort_order": len(media),
            },
        )

    if not media:
        raise ValueError("Input data must include at least one valid image reference.")

    return media


def normalize_price_value(raw_value: Any) -> float:
    if isinstance(raw_value, dict):
        translated = raw_value.get("translate")
        if translated in (None, "") or str(translated).strip().lower() == "none":
            raise ValueError(f"Price object is missing 'translate': {raw_value}")
        raw_value = translated
    if isinstance(raw_value, str) and raw_value.strip().lower() == "none":
        raise ValueError(f"Price value is invalid: {raw_value}")
    return float(raw_value)


def is_missing_price(raw_value: Any) -> bool:
    if raw_value in (None, "", {}, []):
        return True
    if isinstance(raw_value, str):
        return raw_value.strip().lower() == "none"
    if isinstance(raw_value, dict):
        translated = raw_value.get("translate")
        return translated in (None, "") or str(translated).strip().lower() == "none"
    return False


def resolve_pricing(data: dict[str, Any]) -> tuple[float, float | None]:
    new_price = normalize_price_value(data["new_price"])
    old_price_data = data.get("old_price")

    if not is_missing_price(old_price_data):
        price = normalize_price_value(old_price_data)
        sale_price = new_price
    else:
        price = new_price
        sale_price = None

    return price, sale_price


def compact_brands_for_ai(brands: list[dict[str, Any]]) -> list[str]:
    return [
        str(brand.get("name_en", "")).strip()
        for brand in brands
        if str(brand.get("name_en", "")).strip()
    ]


def compact_specifications_for_ai(specifications: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compacted: list[dict[str, Any]] = []
    for specification in specifications:
        compacted.append(
            {
                "id": specification.get("id"),
                "name_en": specification.get("name_en"),
                "name_ar": specification.get("name_ar"),
                "unit_en": specification.get("unit_en"),
                "unit_ar": specification.get("unit_ar"),
                "allow_ai_inference": specification.get("allow_ai_inference", False),
                "values": [
                    {
                        "id": value.get("id"),
                        "value_en": value.get("value_en"),
                        "value_ar": value.get("value_ar"),
                    }
                    for value in specification.get("values", [])
                    if value.get("is_active", True)
                ],
            },
        )
    return compacted


def compact_attributes_for_ai(attributes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compacted: list[dict[str, Any]] = []
    for attribute in attributes:
        compacted.append(
            {
                "id": attribute.get("id"),
                "name_en": attribute.get("name_en"),
                "name_ar": attribute.get("name_ar"),
                "type": attribute.get("type"),
                "unit_en": attribute.get("unit_en"),
                "unit_ar": attribute.get("unit_ar"),
                "is_color": attribute.get("is_color"),
                "allow_ai_inference": attribute.get("allow_ai_inference", False),
                "values": [
                    {
                        "id": value.get("id"),
                        "value_en": value.get("value_en"),
                        "value_ar": value.get("value_ar"),
                        "color_code": value.get("color_code"),
                    }
                    for value in attribute.get("values", [])
                    if value.get("is_active", True)
                ],
            },
        )
    return compacted


def call_ai(
    client: Any,
    data: dict[str, Any],
    brands_res: list[dict[str, Any]],
    specifications_res: list[dict[str, Any]],
    attribute_res: list[dict[str, Any]],
    model: str = DEFAULT_OPENAI_MODEL,
    source_file: str | None = None,
) -> dict[str, Any]:
    brands_catalog = compact_brands_for_ai(brands_res)
    specifications_catalog = compact_specifications_for_ai(specifications_res)
    attributes_catalog = compact_attributes_for_ai(attribute_res)

    system_prompt = f"""You are an expert ecommerce data entry specialist and SEO optimizer.

Your job is to receive a raw product and return a fully optimized, clean product ready for publishing.

DATABASE BRANDS:
{json.dumps(brands_catalog, indent=2, ensure_ascii=False)}

DATABASE SPECIFICATIONS:
{json.dumps(specifications_catalog, indent=2, ensure_ascii=False)}

DATABASE ATTRIBUTES:
{json.dumps(attributes_catalog, indent=2, ensure_ascii=False)}

Instructions:

0. BRAND:
    - The source brand may be missing.
    - Use DATABASE BRANDS plus the title/description to infer the correct brand when possible.
    - Return brand_name as the exact English brand name from DATABASE BRANDS.
    - If no confident brand match exists, return null.

1. TITLE:
    - Rewrite the title to be SEO-friendly, clear, and concise.
    - Translate the optimized title to Arabic.

2. DESCRIPTION:
    - Rewrite the description to be engaging, informative, and SEO-optimized.
    - Format it as clean HTML using tags like <ul>, <li>, <strong> — NO inline styles, NO classes.
    - Structure it as a bullet list.
    - If any specification has no match in the database (specification_id = "not_exist"), append it naturally into the HTML description.
    - If any attribute has no match in the database (attribute_id = "not_exist"), append it naturally into the HTML description.
    - Translate the full HTML description to Arabic (keep HTML tags, translate only the text inside them).

3. SPECIFICATIONS:
    STEP 1 — EXTRACT (do this first, before any matching):
        - Read the product title word by word. Pull out every measurable or descriptive value.
        - Read the product description sentence by sentence. Pull out every measurable or descriptive value.
        - Read every raw specification key-value pair.
        - Combine all extracted values into a single master list.
        - DO NOT skip this step.

    STEP 2 — CLASSIFY AND MATCH (CRITICAL RULE):
        - Go through the DATABASE SPECIFICATIONS list from top to bottom.
        - Pay STRICT attention to the "allow_ai_inference" flag for each specification:
            * If allow_ai_inference is FALSE: The metric MUST exist in the source data. You ARE EXPLICITLY ALLOWED to match synonyms, typos, and slight naming variations (e.g., source "Response Time" maps to DB "Responsive Time"). This is NOT considered guessing. If the spec name exists in the source but its specific value (e.g., "4ms") is missing from the DB values list, DO NOT skip the specification.
            * If allow_ai_inference is TRUE: You MUST deduce the value based on other specifications, even if the exact word is not explicitly written in the source text.
        - Mark each DB spec as: FOUND, INFERRED, or NOT FOUND.

    STEP 3 — BUILD the specifications array:
        - For every FOUND or INFERRED DB spec:
            * If the exact value exists in DB → matched_value_id = <int id>.
            * If the exact value does NOT exist in DB → matched_value_id = "not_exist", and put the raw string in original_value.name_en.
            * YOU MUST NOT drop a specification just because its value is missing from the DB. Use "not_exist".
            * ONLY when the specification has a unit such as inch, Hz, ms, or GB, NEVER choose the nearest or closest existing database value for measurable data. If the source says "25 inch" and the database has only "24.5 inch", you MUST return "not_exist" and preserve "25 inch" as the original value.
        - For every NOT FOUND DB spec → skip it entirely.

4. ATTRIBUTES:
    STEP 1 — EXTRACT:
        - Read the product title/description for color, size, material, language, or variant.
        - Read every raw attribute field.
        - Combine all extracted values into a single master list.

    STEP 2 — CLASSIFY AND MATCH (CRITICAL RULE):
        - Go through the DATABASE SPECIFICATIONS list from top to bottom.
        - Pay STRICT attention to the "allow_ai_inference" flag for each specification:
            * If allow_ai_inference is FALSE: The metric MUST exist in the source data. You ARE EXPLICITLY ALLOWED to match synonyms, typos, and slight naming variations (e.g., source "Response Time" maps to DB "Responsive Time"). This is NOT considered guessing. If the spec name exists in the source but its specific value (e.g., "4ms") is missing from the DB values list, DO NOT skip the specification.
            * If allow_ai_inference is TRUE: You MUST deduce ALL applicable values based on context (e.g., if a monitor has "Game Mode" and is a "Business Monitor", you MUST infer BOTH "Gaming" and "Office" usages).
        - Mark each DB spec as: FOUND, INFERRED, or NOT FOUND.

    STEP 3 — BUILD the specifications array:
        - For every FOUND or INFERRED DB spec:
            * A specification can have MULTIPLE values. If multiple values apply (like multiple Usages or multiple Ports), include ALL of them as separate objects inside the "values" array.
            * If the exact value exists in DB → matched_value_id = <int id>.
            * If the exact value does NOT exist in DB → matched_value_id = "not_exist", and put the raw string in original_value.name_en.
            * YOU MUST NOT drop a specification just because its value is missing from the DB. Use "not_exist".
            * ONLY when the attribute has a unit such as inch, Hz, ms, or GB, NEVER choose the nearest or closest existing database value for measurable data. If the exact raw value is missing, return "not_exist" and preserve the raw value.
            * If the attribute has no unit, do normal text/value matching and do not force a new value based only on this numeric safeguard.
        - For every NOT FOUND DB spec → skip it entirely.

5. META DESCRIPTION: Must be 160 characters or fewer.
6. META TITLE: Must be 70 characters or fewer.
7. SHORT DESCRIPTION: The 4 most important points as clean HTML bullet list.

STRICT RULES:
    1. DO NOT explain anything.
    2. Output JSON ONLY. No markdown. No comments. No code fences.

Respond ONLY with a JSON object in this exact format:
{{
"brand_name": "<exact english brand name from database> or null",
"title_en": "<seo optimized title in english>",
"title_ar": "<seo optimized title in arabic>",
"meta_title_en": "<meta seo optimized title in english>",
"meta_title_ar": "<meta seo optimized title in arabic>",
"short_description_en": "<4 most important points as HTML bullet list in english>",
"short_description_ar": "<4 most important points as HTML bullet list in arabic>",
"description_en": "<full HTML formatted description in english>",
"description_ar": "<full HTML formatted description in arabic>",
"meta_description_en": "<meta seo optimized description in english, max 160 chars>",
"meta_description_ar": "<meta seo optimized description in arabic, max 160 chars>",
"specifications": [
    {{
    "specification_id": <int>,
    "values": [
        {{
            "original_value": {{
                "name_en": "<raw extracted value in english>",
                "name_ar": "<arabic translation if text, same as name_en if numeric/technical>"
            }},
            "matched_value_id": <int> or "not_exist"
        }}
    ]
    }}
],
"attributes": [
    {{
        "attribute": {{
            "original_value": "<string>",
            "attribute_id": <int>
        }},
        "values": [
            {{
            "original_value": "<raw extracted value string>",
            "matched_value_id": <int> or "not_exist"
            }}
        ]
    }}
]
}}"""

    openai_input = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "brand": data.get("brand"),
                    "title": data["title"],
                    "description": data["description"],
                    "specification": data.get("specification", []),
                    "attributes": data.get("attributes", []),
                },
                indent=2,
                ensure_ascii=False,
            ),
        },
    ]

    response = None
    raw = None

    try:
        response = client.responses.create(
        model=model,
        input=openai_input,
        )

        raw = response.output_text.strip()
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        parsed = json.loads(raw)
        append_openai_log(
            build_openai_log_entry(
                model=model,
                openai_input=openai_input,
                raw_product_input=data,
                source_file=source_file,
                response=response,
                raw_output_text=raw,
                parsed_output=parsed,
            ),
        )
        return parsed
    except Exception as error:
        append_openai_log(
            build_openai_log_entry(
                model=model,
                openai_input=openai_input,
                raw_product_input=data,
                source_file=source_file,
                response=response,
                raw_output_text=raw,
                error_message=str(error),
            ),
        )
        raise


def import_product(
    client: Any,
    data: dict[str, Any],
    category_id: int,
    vendor_id: int,
    auth_token: str | None = None,
    base_url: str = DEFAULT_BASE_URL,
    model: str = DEFAULT_OPENAI_MODEL,
    source_file: str | None = None,
) -> dict[str, Any]:
    session = make_session(auth_token=auth_token, base_url=base_url)

    log.info("Fetching database lookups...")
    brands_res = extract_paginated_list(api_get(session, "brands", {"limit": 1000}))
    log.info("Fetched %s brands", len(brands_res))
    specifications_res = api_get(session, "specifications", {"category_ids": str(category_id)})
    attribute_res = api_get(session, "attributes", {"category_ids": str(category_id)})

    log.info("Calling AI for product enrichment...")
    ai_result = call_ai(
        client,
        data,
        brands_res,
        specifications_res,
        attribute_res,
        model=model,
        source_file=source_file,
    )
    log.info("AI result received: title_en='%s'", ai_result["title_en"])

    brand_id, resolved_brand_name, brand_created = resolve_or_create_brand_id(
        session,
        brands_res,
        data,
        ai_result.get("brand_name"),
    )
    if brand_id is not None and resolved_brand_name is not None:
        if brand_created:
            log.info("Created brand '%s' -> id=%s", resolved_brand_name, brand_id)
        else:
            log.info("Resolved brand '%s' -> id=%s", resolved_brand_name, brand_id)
    else:
        log.info("No brand resolved from source data or AI; creating product without brand_id.")

    log.info("Resolving specifications...")
    resolved_specs = resolve_specifications(
        session,
        ai_result.get("specifications", []),
        specifications_res,
    )

    log.info("Resolving attributes...")
    resolved_attrs = resolve_attributes(
        session,
        ai_result.get("attributes", []),
        attribute_res,
    )

    log.info("Uploading media...")
    media = build_media(session, data)

    price, sale_price = resolve_pricing(data)
    log.info("Pricing resolved: price=%s sale_price=%s", price, sale_price)

    stock_value = str(data.get("stock", "")).strip().lower()
    is_out_of_stock = stock_value in {"none", "0", "false", "out_of_stock"}

    payload = {
        "name_en": ai_result["title_en"],
        "name_ar": ai_result["title_ar"],
        "meta_title_en": ai_result["meta_title_en"],
        "meta_title_ar": ai_result["meta_title_ar"],
        "status": "review",
        "short_description_en": ai_result["short_description_en"],
        "short_description_ar": ai_result["short_description_ar"],
        "long_description_en": ai_result["description_en"],
        "long_description_ar": ai_result["description_ar"],
        "meta_description_en": ai_result["meta_description_en"],
        "meta_description_ar": ai_result["meta_description_ar"],
        "category_ids": [category_id],
        "reference_link": data.get("reference_link"),
        "vendor_id": vendor_id,
        "visible": True,
        "specifications": resolved_specs,
        "attributes": resolved_attrs,
        "sale_price": sale_price,
        "price": price,
        "quantity": 0 if is_out_of_stock else 100,
        "is_out_of_stock": is_out_of_stock,
        "media": media,
        "linked_product_ids": [],
    }
    if brand_id is not None:
        payload["brand_id"] = brand_id

    log.info("POSTing product to API...")
    result = api_post(session, "products", payload)
    log.info("Product created successfully.")
    return result


def load_input_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def build_openai_client() -> Any:
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency 'openai'. Install it with: pip install openai requests",
        ) from exc

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Missing OPENAI_API_KEY environment variable.")

    return OpenAI(api_key=api_key)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import a product into Ordonsooq.")
    parser.add_argument("--input", required=True, help="Path to the source product JSON file.")
    parser.add_argument("--category-id", required=True, type=int, help="Category ID to assign to the product.")
    parser.add_argument("--vendor-id", required=True, type=int, help="Vendor ID to assign to the product.")
    parser.add_argument(
        "--auth-token",
        default=None,
        help="Bearer token for the API. If omitted, PRODUCT_IMPORT_AUTH_TOKEN is used.",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"API base URL. Default: {DEFAULT_BASE_URL}",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_OPENAI_MODEL,
        help=f"OpenAI model to use. Default: {DEFAULT_OPENAI_MODEL}",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    if not input_path.exists():
        raise FileNotFoundError(f"Input JSON file not found: {input_path}")

    client = build_openai_client()
    data = normalize_input_data(load_input_json(input_path))
    result = import_product(
        client=client,
        data=data,
        category_id=args.category_id,
        vendor_id=args.vendor_id,
        auth_token=args.auth_token,
        base_url=args.base_url,
        model=args.model,
        source_file=str(input_path.resolve()),
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())