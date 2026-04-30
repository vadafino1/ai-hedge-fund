import shutil
import subprocess

import pytest

pytestmark = pytest.mark.docker


def test_docker_image_imports_runner_when_available():
    if shutil.which("docker") is None:
        pytest.skip("Docker not available")
    image = "ai-hedge-fund:latest"
    inspect = subprocess.run(["docker", "image", "inspect", image], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if inspect.returncode != 0:
        pytest.skip(f"Docker image {image} is not built")

    result = subprocess.run(["docker", "run", "--rm", image, "python", "-m", "app.backend.sandbox.runner", "--help"], capture_output=True, text=True, timeout=30)

    assert result.returncode == 0
