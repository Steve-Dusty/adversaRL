"""Goal-to-specification pipeline for AdversaRL training setup."""

from .spec_loader import load_training_spec, SpecificationError

__all__ = ['load_training_spec', 'SpecificationError']
