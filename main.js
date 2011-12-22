var Ontology = require("./parseadl").Ontology;

var infile = process.argv[2];
var outfile = process.argv[3];

var ont = new Ontology(outfile);
ont.processArchetype(infile);
ont.writeFile();
