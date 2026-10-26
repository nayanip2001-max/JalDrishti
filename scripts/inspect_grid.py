import sys, earthaccess, h5py
earthaccess.login(strategy="netrc")
for url in sys.argv[1:]:
    h = h5py.File(earthaccess.open([url])[0], "r")
    g = h["science/LSAR/GCOV/grids/frequencyA"]
    print(url.rsplit("/",1)[-1][:60])
    print(" terms", [t.decode() for t in g["listOfCovarianceTerms"][()]], "pols", [p.decode() for p in g["listOfPolarizations"][()]])
    print(" epsg", g["projection"][()], "dx", g["xCoordinateSpacing"][()], "dy", g["yCoordinateSpacing"][()])
    x, y = g["xCoordinates"], g["yCoordinates"]
    print(" x", x[0], x[-1], " y", y[0], y[-1], " shape", g["HHHH"].shape, "chunks", g["HHHH"].chunks, "compression", g["HHHH"].compression)
    print(" mask attrs", dict((k, (v if not hasattr(v,'decode') else v.decode())) for k,v in g["mask"].attrs.items()))
    print(" HHHH attrs", {k: v for k,v in g["HHHH"].attrs.items()})
