"""
Client name normalization utility.

All client names entering or leaving the system pass through
normalize_client_name so that case and whitespace differences
never cause mismatches.

Examples
--------
    normalize_client_name("ajanta pharma")   → "AJANTA PHARMA"
    normalize_client_name("  Ajanta  Pharma ") → "AJANTA PHARMA"
    normalize_client_name("AJANTA PHARMA")   → "AJANTA PHARMA"
"""


def normalize_client_name(name: str) -> str:
    """
    Return a canonical uppercase, single-space client name.

    Steps
    -----
    1. Strip leading/trailing whitespace.
    2. Collapse internal whitespace runs to a single space.
    3. Convert to uppercase.

    Returns an empty string for blank / None input.
    """
    if not name:
        return ""
    return " ".join(name.strip().split()).upper()
