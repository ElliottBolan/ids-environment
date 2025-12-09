
# Auto-generated stub for FCBF_module to keep uploaded models runnable when dependency is absent.
import numpy as np

class _BaseFCBF:
	def __init__(self, *args, **kwargs):
		pass
	def fit(self, X, y=None):
		return self
	def fit_transform(self, X, y=None):
		return np.asarray(X)
	def transform(self, X):
		return np.asarray(X)

class FCBF(_BaseFCBF):
	pass

class FCBFK(_BaseFCBF):
	pass

class FCBFiP(_BaseFCBF):
	pass

def get_i(*args, **kwargs):
	return None
