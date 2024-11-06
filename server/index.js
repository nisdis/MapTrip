// index.js
process.env.UV_THREADPOOL_SIZE = Math.ceil(require("os").cpus().length * 1.5);
const express = require("express");
const cors = require("cors");
const OSRM = require("@project-osrm/osrm");

port = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.options("*", cors());
const osrm = new OSRM({
  algorithm: "MLD",
  path: "/Users/nissimdsilva/Downloads/sb1-q8fu52(1)/data/india-western-southern.osrm",
});

function route(req, res) {
  // overview=false&alternatives=true&steps=true&hints=;
  const alternatives = Boolean(req.query?.alternatives);
  const steps = Boolean(req.query?.steps);
  const overview = req.query?.overview;

  coordinates = req.params.coordinates.split(";");
  for (var i = 0; i < coordinates.length; i++) {
    coordinates[i] = coordinates[i].split(",").map(Number);
  }
  var options = {
    coordinates,
    alternatives,
    steps,
    overview,
  };
  console.log(options);

  osrm.route(options, function (err, result) {
    if (err) {
      console.log(err);
      return res.json({
        error: err.message,
      });
    } else {
      result.code = "Ok";
      return res.json(result);
    }
  });
}

app.get("/route/v1/driving/:coordinates", route);
app.listen(port);
