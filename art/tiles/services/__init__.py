"""
Service buildings, one module per district: each service has its front building lm_<id>(fw, fh, tier, col, key) ->
Canvas and its tower tw_<id>(tier, k) -> Canvas or None (none at tier 1), the tower shaped by the service.

REGISTRY = {service id: (lm, tw)}: generate_tiles.drawer_for takes lm from here and growth_art.tower_for takes tw (the
only source of service buildings; hq.py draws the district HQs). Importing fails loudly on a drawer defined twice,
an lm_ without its tw_ (or the reverse), or a service of a district module that has no drawer.
"""
import importlib
import json
import os

# Every district module present here (services/<district>.py). ART_DISTRICTS=compute,storage limits it (a worker
# drawing one district previews it alone, while another district's module is half written).
_ONLY = [d for d in os.environ.get("ART_DISTRICTS", "").split(",") if d]
_HERE = os.path.dirname(__file__)
MODULES = {
    d: importlib.import_module(f"services.{d}")
    for d in ("compute", "storage", "database", "networking", "security", "aiml", "management")
    if os.path.exists(os.path.join(_HERE, f"{d}.py")) and (not _ONLY or d in _ONLY)
}


def _collect():
    with open(os.path.join(os.path.dirname(__file__), "..", "..", "..", "shared", "world.json")) as f:
        world = json.load(f)
    reg = {}
    for district, mod in MODULES.items():
        names = [n for n in vars(mod) if n.startswith(("lm_", "tw_")) and callable(getattr(mod, n))]
        ids = {n[3:] for n in names}
        for sid in sorted(ids):
            lm, tw = getattr(mod, "lm_" + sid, None), getattr(mod, "tw_" + sid, None)
            if lm is None or tw is None:
                raise ValueError(f"services/{district}.py: {sid} needs both lm_{sid} and tw_{sid}")
            if sid in reg:
                raise ValueError(f"two drawers for {sid}")
            reg[sid] = (lm, tw)
        want = {s["id"] for s in world["services"] if s["districtId"] == district}
        if want - ids:
            raise ValueError(f"services/{district}.py is missing drawers for {sorted(want - ids)}")
        if ids - want:
            raise ValueError(f"services/{district}.py draws services not in {district}: {sorted(ids - want)}")
    return reg


REGISTRY = _collect()
