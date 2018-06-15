const env = require("./.env");
const http = require("http");
const https = require("https");
const url = require("url");
const inside = require("point-in-geopolygon");
const fs = require("fs");

const districts = require("./districts.json")
const cache = {};
const CACHETIME = env.CACHETIME;


http.createServer((req, res) => {
    const params = url.parse(req.url,true);

    if(params.pathname == '/' || params.pathname == 'index.html'){
        fs.readFile('./index.html', (error, content)=>{
            content = content.toString().replace('{{YOUR_API_KEY}}', env.GOOGLEAPIKEY)
            res.setHeader('Content-Type', 'text/html');
            res.write(content);
            res.end();
        })
    }else if(params.pathname == '/bouncy.html' ){
        fs.readFile('./bouncy.html', (error, content)=>{
            res.setHeader('Content-Type', 'text/html');
            res.write(content);
            res.end();
        })
    }else if(params.pathname == '/api/cache' ){
    res.setHeader('Content-Type', 'application/json');
        res.write(JSON.stringify(cache));
        res.end();
    }else if(params.pathname == '/api/get' ){
        const NOW = new Date().valueOf();
        if(!params.query.address){
            res.statusCode = 404;
            res.write('incorrect parameter'); 
            return res.end(); 
        }
        const ADDRESS = params.query.address;
        if (cache[ADDRESS]) {
            if (cache[ADDRESS].cacheTimeout > NOW) {
              console.log("From cache!");
              const tmp = Object.assign({}, cache[ADDRESS]);
              delete tmp.cacheTimeout;
              res.setHeader('Content-Type', 'application/json');
              res.write(JSON.stringify(tmp));
              return res.end(); 
            }
        }
        const mapurl = "https://maps.googleapis.com/maps/api/geocode/json?address=" + ADDRESS + "&key=" + env.GOOGLEAPIKEY;
        https.get(mapurl, (resp) =>{
            const { statusCode } = resp;
            const contentType = resp.headers['content-type'];
            let allData = '';

            if (statusCode !== 200) {
                res.statusCode = 400;
                res.write('error'); 
                res.end(); 
            } else {
                resp.on('data', (chunk)=>{
                    allData += chunk
                }).on('end', () =>{
                    const parsedData = JSON.parse(allData);
                    if(parsedData.status == "ZERO_RESULTS"){
                        res.write("could not find location"); 
                        return res.end(); 
                    }else if(parsedData.status == "OK"){
                        const EXPIRE = NOW * 1 + CACHETIME * 1;
                        const first = parsedData.results[0];
                        const results = {
                          "status": "OK",
                          "search": ADDRESS,
                          "location": {
                            "address": first.formatted_address,
                            "lat": first.geometry.location.lat,
                            "lng": first.geometry.location.lng
                          },
                          "serviceArea": "not found"
                        };

                        if (first.address_components) {
                            results.location.city = getAddressComponent(first.address_components, "postal_town");
                            results.location.addressNumber = getAddressComponent(first.address_components, "street_number");
                            results.location.addressStreet = getAddressComponent(first.address_components, "route");
                          }
                  
                          const found = inside.feature(districts, [first.geometry.location.lng, first.geometry.location.lat] );
                          if (found !== -1) {
                            results.district = {
                                "type" : "FeatureCollection",
                                "features" : [{
                                    "type":"Feature",
                                    "geometry" : {
                                        "type" : "Point",
                                        "coordinates" : [first.geometry.location.lng, first.geometry.location.lat]
                                    },
                                    "properties" : {
                                        "Name" : ADDRESS
                                    }
                                },{
                                    "type" : "Feature",
                                    "geometry" :  districts.features[found.id].geometry,
                                    "properties" : {
                                        "Name" : found.properties.Name 
                                    }
                                    },
                                ]
                            }
                            results.serviceArea = found.properties.Name;
                          }
                                                            

                        res.setHeader('Content-Type', 'application/json');
                        res.write(JSON.stringify(results)); 
                        res.end(); 
                        results.cacheTimeout = EXPIRE;
                        cache[ADDRESS] = results;
                        return
                    }else {
                        res.write('We have a problem accessing location provider.  Please try again later'); 
                        return res.end(); 
                    }
                }).on('error', (e) => {
                    console.error(`Got error: ${e.message}`);
                  });
            }
        })
    }
    else {
        res.statusCode = 404;
        res.write('Page not found'); 
        res.end(); 
    }
  }).listen({"port": env.PORT, "host": "0.0.0.0"});


  function getAddressComponent(address_components, item) {
    for ( let x = 0; x < address_components.length; x++) {
       if (address_components[x] && address_components[x].types.find( function(type) { return type === item; })) {
          return address_components[x].long_name || address_components[x].short_name || "unknown";
       }
    }
    return null;
  }
  