import sys, earthaccess, h5py
earthaccess.login(strategy="netrc")
url = sys.argv[1]
fs = earthaccess.get_requests_https_session  # noqa
f = earthaccess.open([url])[0]
h = h5py.File(f, "r")
def show(name, obj):
    if isinstance(obj, h5py.Dataset):
        print(f"{name}  {obj.shape} {obj.dtype}")
h.visititems(show)
