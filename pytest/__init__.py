
# stub pytest package auto-generated for CI
__all__ = [
    "fixture", "mark", "raises", "skip", "parametrize", "approx"
]

import types, sys

# simple decorator factories

_def_noop = lambda *a, **k: lambda func: func

fixture = _def_noop

class _Mark:  # emulate pytest.mark
    def __getattr__(self, name):
        return _def_noop

mark = _Mark()

# common helpers

def raises(exc):
    return lambda func: func  # no-op helper

def skip(reason=""):
    def _decorator(func):
        return func
    return _decorator

def parametrize(*args, **kwargs):
    return _def_noop

def approx(value, rel=None, abs=None):
    return value
