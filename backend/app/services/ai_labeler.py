import json
import re
from httpx import Client, Timeout

DEFAULT_TIMEOUT = 120.0


def build_prompt(data_text: str, prompt_definition: str, target_field_name: str) -> str:
    return f"""你是一个文本分类专家。请根据下面的标签定义，分析给定文本内容，给出该条数据适用的所有标签。

【标签定义】
{prompt_definition}

【待分析文本】
字段名：{target_field_name}
内容：{data_text}

【输出要求】
- 必须返回严格的 JSON 格式，不要添加任何 markdown 标记
- JSON 包含两个字段：
  "labels": 字符串数组，列出所有匹配的标签名称（必须与定义中的一致，无匹配则为 []）
  "reasoning": 字符串，简述你的分析判断思路（100字以内）

输出格式：
{{"labels": ["标签A", "标签B"], "reasoning": "分析思路…"}}"""


def parse_ai_response(response_text: str) -> tuple[list[str], str]:
    """从 AI 返回中提取标签列表和思考过程。返回 (labels, reasoning)"""
    text = response_text.strip()

    # Try direct JSON parse
    try:
        data = json.loads(text)
        return _extract_labels_and_reasoning(data)
    except json.JSONDecodeError:
        pass

    # Try markdown code block
    match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(1))
            return _extract_labels_and_reasoning(data)
        except json.JSONDecodeError:
            pass

    # Try finding any JSON object
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group())
            return _extract_labels_and_reasoning(data)
        except json.JSONDecodeError:
            pass

    # Fallback: old format (array only, no reasoning)
    match = re.search(r'\[.*?\]', text, re.DOTALL)
    if match:
        try:
            result = json.loads(match.group())
            if isinstance(result, list):
                return [str(x) for x in result], text[:200]
        except json.JSONDecodeError:
            pass

    return [], text[:200]


def _extract_labels_and_reasoning(data: dict) -> tuple[list[str], str]:
    """Helper: extract labels + reasoning from parsed JSON dict."""
    labels = []
    if "labels" in data and isinstance(data["labels"], list):
        labels = [str(x) for x in data["labels"]]
    reasoning = str(data.get("reasoning", data.get("reasoning_content", "")))
    return labels, reasoning


def call_ai(prompt: str, api_key: str, base_url: str, model: str) -> str:
    # 智能拼接 URL：兼容各种 base_url 写法
    base = base_url.rstrip('/')
    if base.endswith('/chat/completions'):
        url = base
    elif base.endswith('/v1'):
        url = f"{base}/chat/completions"
    else:
        # 大部分 OpenAI 兼容 API 需要 /v1 前缀
        url = f"{base}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "你是一个精确的文本分类器。只输出 JSON 对象，不要加任何解释或 markdown。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 2000,
    }
    with Client(timeout=Timeout(DEFAULT_TIMEOUT)) as client:
        resp = client.post(url, headers=headers, json=payload)
        if resp.status_code >= 400:
            # 把 API 返回的详细错误信息抛出来
            detail = resp.text[:500]
            raise RuntimeError(f"API {resp.status_code}: {detail}")
        data = resp.json()
        return data["choices"][0]["message"]["content"]
