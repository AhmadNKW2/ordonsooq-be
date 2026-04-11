import argparse
import json
import logging
import mimetypes
import os
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
NOT_EXIST = "not_exist"


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


def normalize_lookup_text(value: str) -> str:
    return "".join(character for character in value.casefold() if character.isalnum())


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
) -> list[dict[str, Any]]:
    resolved: list[dict[str, Any]] = []

    for specification in ai_specifications:
        specification_id = int(specification["specification_id"])
        resolved_value_ids: list[int] = []

        for value in specification.get("values", []):
            matched_id = value.get("matched_value_id")
            if matched_id == NOT_EXIST:
                original_value = value["original_value"]
                new_value_en = original_value["name_en"]
                new_value_ar = original_value["name_ar"]
                log.info(
                    "Specification %s: creating missing value '%s'.",
                    specification_id,
                    new_value_en,
                )
                matched_id = create_specification_value(
                    session,
                    specification_id,
                    new_value_en,
                    new_value_ar,
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
) -> list[dict[str, Any]]:
    resolved: list[dict[str, Any]] = []

    for attribute in ai_attributes:
        attribute_id = int(attribute["attribute"]["attribute_id"])
        resolved_value_ids: list[int] = []

        for value in attribute.get("values", []):
            matched_id = value.get("matched_value_id")
            if matched_id == NOT_EXIST:
                raw_value = str(value["original_value"])
                log.info(
                    "Attribute %s: creating missing value '%s'.",
                    attribute_id,
                    raw_value,
                )
                matched_id = create_attribute_value(
                    session,
                    attribute_id,
                    raw_value,
                    raw_value,
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


def build_media(session: requests.Session, data: dict[str, Any]) -> list[dict[str, Any]]:
    primary_image_url = data.get("image") or next(iter(data.get("images", [])), None)
    if not primary_image_url:
        raise ValueError("Input data must include 'image' or a non-empty 'images' array.")

    media: list[dict[str, Any]] = []
    primary_id = download_image(session, primary_image_url)
    media.append(
        {
            "media_id": primary_id,
            "is_primary": True,
            "sort_order": 0,
        },
    )

    seen_urls = {primary_image_url}
    next_sort_order = 1
    for image_url in data.get("images", []):
        if not image_url or image_url in seen_urls:
            continue
        seen_urls.add(image_url)
        media.append(
            {
                "media_id": download_image(session, image_url),
                "is_primary": False,
                "sort_order": next_sort_order,
            },
        )
        next_sort_order += 1

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
            * If allow_ai_inference is FALSE (Strict Extraction): You MUST ONLY assign a value if it is explicitly mentioned in the source input data. DO NOT guess. If not mentioned, you MUST skip it.
            * If allow_ai_inference is TRUE (Logical Inference): You MUST deduce the value based on other technical specifications, even if the exact word is not explicitly written in the source text (e.g., inferring "Gaming" usage from "144Hz" and "1ms").
        - Mark each DB spec as: FOUND, INFERRED, or NOT FOUND.

    STEP 3 — BUILD the specifications array:
        - For every FOUND or INFERRED DB spec:
            * If value exists in DB → matched_value_id = <int id>.
            * If value does NOT exist in DB → matched_value_id = "not_exist", original_value as name_en/name_ar.
            * DO NOT drop matched or inferred values.
        - For every NOT FOUND DB spec → skip it entirely.
        - DO NOT include specification_id = "not_exist" in the output.

4. ATTRIBUTES:
    STEP 1 — EXTRACT:
        - Read the product title/description for color, size, material, language, or variant.
        - Read every raw attribute field.
        - Combine all extracted values into a single master list.

    STEP 2 — CLASSIFY AND MATCH:
        - Go through the DATABASE ATTRIBUTES list from top to bottom.
        - Pay STRICT attention to the "allow_ai_inference" flag:
            * If allow_ai_inference is FALSE: Exact extraction only. Do not guess. Skip if missing.
            * If allow_ai_inference is TRUE: Infer the attribute based on context if not explicitly mentioned.
        - Mark each as: FOUND, INFERRED, or NOT FOUND.

    STEP 3 — BUILD the attributes array:
        - For every FOUND or INFERRED DB attribute:
            * If value exists in DB → matched_value_id = <int id>.
            * If value does NOT exist in DB → matched_value_id = "not_exist".
        - For every NOT FOUND DB attribute → skip it entirely.

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

    response = client.responses.create(
        model=model,
        input=[
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
        ],
    )

    raw = response.output_text.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    return json.loads(raw)


def import_product(
    client: Any,
    data: dict[str, Any],
    category_id: int,
    vendor_id: int,
    auth_token: str | None = None,
    base_url: str = DEFAULT_BASE_URL,
    model: str = DEFAULT_OPENAI_MODEL,
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
    )
    log.info("AI result received: title_en='%s'", ai_result["title_en"])

    brand_id, resolved_brand_name = resolve_optional_brand_id(
        brands_res,
        data,
        ai_result.get("brand_name"),
    )
    if brand_id is not None and resolved_brand_name is not None:
        log.info("Resolved brand '%s' -> id=%s", resolved_brand_name, brand_id)
    else:
        log.info("No brand resolved from source data or AI; creating product without brand_id.")

    log.info("Resolving specifications...")
    resolved_specs = resolve_specifications(session, ai_result.get("specifications", []))

    log.info("Resolving attributes...")
    resolved_attrs = resolve_attributes(session, ai_result.get("attributes", []))

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
    data = load_input_json(input_path)
    result = import_product(
        client=client,
        data=data,
        category_id=args.category_id,
        vendor_id=args.vendor_id,
        auth_token=args.auth_token,
        base_url=args.base_url,
        model=args.model,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())