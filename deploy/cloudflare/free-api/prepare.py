"""Prepare the private API Worker. Run with uv and Python 3.13 or later."""

from hashlib import file_digest
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
from tempfile import TemporaryDirectory
from urllib.request import urlopen


WORKER = Path(__file__).resolve().parent
ROOT = WORKER.parents[2]
FIXTURES = ("persona_a.json", "persona_b.json", "persona_c.json", "savings_feed.json")
RAPIDFUZZ = "rapidfuzz-3.14.5"
RAPIDFUZZ_SOURCE = (
    "https://files.pythonhosted.org/packages/2c/21/"
    "ef6157213316e85790041254259907eb722e00b03480256c0545d98acd33/"
    f"{RAPIDFUZZ}.tar.gz"
)
RAPIDFUZZ_SHA256 = "ba10ac57884ce82112f7ed910b67e7fb6072d8ef2c06e30dc63c0f604a112e0e"
RAPIDFUZZ_BUILD_REQUIREMENTS = "scikit-build-core==1.1.2\npackaging==26.3\npathspec==1.1.1\n"


def stage_sources():
    for package in ("api", "engine"):
        source = ROOT / package
        target = WORKER / "src" / package
        if target.exists():
            shutil.rmtree(target)
        for path in sorted(source.rglob("*.py")):
            relative = path.relative_to(source)
            if "tests" not in relative.parts:
                destination = target / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, destination)

    target = WORKER / "src/data"
    if target.exists():
        shutil.rmtree(target)
    (target / "mock").mkdir(parents=True)
    for fixture in FIXTURES:
        shutil.copy2(ROOT / "data/mock" / fixture, target / "mock" / fixture)


def build_rapidfuzz():
    wheel_dir = WORKER / "wheels"
    if (wheel_dir / f"{RAPIDFUZZ}-py3-none-any.whl").is_file():
        return False

    # RapidFuzz supports a pure Python wheel through its own build setting.
    # Its PyPI wheels otherwise target native platforms.
    with TemporaryDirectory() as directory:
        work = Path(directory)
        archive = work / "rapidfuzz.tar.gz"
        with urlopen(RAPIDFUZZ_SOURCE, timeout=60) as response, archive.open("wb") as output:
            shutil.copyfileobj(response, output)
        with archive.open("rb") as stream:
            if file_digest(stream, "sha256").hexdigest() != RAPIDFUZZ_SHA256:
                raise ValueError("Unexpected RapidFuzz source hash")
        with tarfile.open(archive) as source:
            source.extractall(work, filter="data")
        constraints = work / "constraints.txt"
        constraints.write_text(RAPIDFUZZ_BUILD_REQUIREMENTS, encoding="utf-8")
        subprocess.run(
            ["uv", "build", "--python", "3.13", "--wheel", "--build-constraints", str(constraints),
             "--config-setting", "wheel.cmake=false",
             "--out-dir", str(wheel_dir), str(work / RAPIDFUZZ)],
            cwd=WORKER,
            env={**os.environ, "SOURCE_DATE_EPOCH": "1667997441"},
            check=True,
        )
    return True


def prepare():
    stage_sources()
    wheel_rebuilt = build_rapidfuzz()
    sync = ["uvx", "--python", "3.13", "--from", "workers-py==1.17.9", "pywrangler", "sync"]
    if wheel_rebuilt:
        sync.append("--force")
    subprocess.run(
        sync,
        cwd=WORKER,
        check=True,
    )

    # Re-export the original compiled implementation without importing SciPy's
    # unrelated optimization families, which exceed the Worker upload limit.
    optimize = WORKER / "python_modules/scipy/optimize"
    if not list(optimize.glob("_lsap.*.so")):
        raise RuntimeError("The pinned SciPy wheel does not contain its compiled assignment solver")
    for module in optimize.iterdir():
        if module.name.startswith("_lsap.") or module.name == "__init__.py":
            continue
        if module.is_dir():
            shutil.rmtree(module)
        else:
            module.unlink()
    (optimize / "__init__.py").write_text(
        "from ._lsap import linear_sum_assignment\n", encoding="utf-8"
    )


if __name__ == "__main__":
    prepare()
