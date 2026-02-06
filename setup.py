from setuptools import setup, find_packages

setup(
    name="adversarl",
    version="0.1.0",
    description="Adversarial Sim-to-Real Transfer via World Model Curriculum Training",
    author="AdversaRL Team",
    packages=find_packages(),
    python_requires=">=3.9",
    install_requires=[
        "odyssey>=1.0.0",
        "anthropic>=0.21.0",
        "gymnasium>=0.29.0",
        "stable-baselines3>=2.2.0",
        "numpy>=1.24.0",
        "torch>=2.1.0",
        "opencv-python>=4.8.0",
        "pillow>=10.0.0",
        "wandb>=0.16.0",
        "fastapi>=0.109.0",
        "uvicorn>=0.27.0",
        "python-dotenv>=1.0.0",
        "pyyaml>=6.0",
    ],
)
