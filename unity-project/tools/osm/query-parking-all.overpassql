[out:json][timeout:60][bbox:37.5105,127.1060,37.5285,127.1330];
(
  nwr[amenity~"^(parking|parking_entrance)$"];
  nwr[name~"^P ?[0-9]"];
  nwr[ref~"^P ?[0-9]"];
  nwr[name~"주차"];
);
out tags center geom;
