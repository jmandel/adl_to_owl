var fs = require('fs');


var Ontology = function(filename) {

	var body = [];
	var prefix = [];
	var filename = filename;
	var self = this;

	this.add_prefix = function(l) {
		prefix.push(l);
	};

	this.add_body_line = function(l) {
		body.push(l);
	};

	this.writeFile = function() {
		var toWrite = '';

		prefix.forEach(function(p) {
			toWrite += 'Prefix('+p.p+':=<'+p.v+'>)\n';
		});

		toWrite += fs.readFileSync('ontohead.owl').toString();
		toWrite += body.join('\n');
		toWrite += fs.readFileSync('ontotail.owl').toString();

		fs.writeFileSync(filename, toWrite);
	};

	function parseCardinalityString(c) {
		var ret = {};
		var cnum = c.split(';')[0];
		var crange = cnum.split('..');
		if (crange.length == 1)
			ret.exact = parseInt(crange[0]);
		else if (crange.length == 2) {
			if (crange[0] !== '*')
				ret.min = parseInt(crange[0]);
			if (crange[1] !== '*')
				ret.max = parseInt(crange[1]);
		}
		
		return ret;
	}
	function owlClass(c) {
		console.log("Class: " + c);
		self.add_body_line('Declaration(Class('+c+'))');
		return c;
	};

	function owlEquivalent(p) {
		if (p.length <= 1 ) 
			return;

		for (var i = 1; i < p.length; i++) {
			self.add_body_line('EquivalentClasses('+p[0] + ' ' + p[i]+')');
		}
	};

	function owlPrefix(p, v) {
		self.add_prefix({p: p, v: v});
	};

	function owlSubClassOf(p) {
		var l = 'SubClassOf('+p.class+' '+p.target+')';
		self.add_body_line(l);
	};	

	function owlObjectProperty(p) {
		self.add_body_line('Declaration(ObjectProperty('+p+'))');
	};

	function owlAnnotation(p) {
		self.add_body_line('AnnotationAssertion('+p.property+' '+p.entity+' "'+p.value+'")');
	};

	function owlCardinality(p) {
		var r = [];

		if (p.exact !== undefined)
			r.push({ cardType: 'ObjectExactCardinality', 
				 cardVal: p.exact});
		else if (p.min !== undefined)
			r.push({ cardType: 'ObjectMinCardinality', 
				 cardVal: p.min});
		else if (p.max !== undefined)
			r.push({ cardType: 'ObjectMaxCardinality', 
				 cardVal: p.max});
		console.log("CARD " + JSON.stringify(p));			

		r.forEach(function(c) {
			var l = 'SubClassOf('+
					p.class + ' '+ 
					c.cardType + '(' + 
						c.cardVal + ' ' + 
						p.onProperty + ' ' + 
						(p.target || '') + 
						     ')' + 
					  ')';
			owlObjectProperty(p.onProperty);
			self.add_body_line(l);	
			console.log("Cardline" + l);
		});
	};

	function getAttr(node_id) {
		return self.archetype['ontology']['term_definitions'][0]['en']['items'][0][node_id];
	};

	function owlCreateIndividual(p) {
		self.add_body_line('Declaration(NamedIndividual('+p.code+'))');
		self.add_body_line('ClassAssertion('+p.class+' '+p.code+')');
		return p.code;
	};

	function recurseOnDefinition(d) {
		var thisClass = owlClass("RM:"+d.rm_type_name);
		if (d.node_id) {
			var par = thisClass; 
			var classLabel = getAttr(d.node_id);

			thisClass = owlClass(self.archetype_prefix+':'+d.node_id);
	
			owlAnnotation({property: 'rdfs:label', entity: thisClass, value: classLabel['text']});
			owlAnnotation({property: 'rdfs:comment', entity: thisClass, value: classLabel['description']});
			
			owlSubClassOf({class: thisClass, target: par});
		}


		d.attributes && d.attributes.forEach(function(a) {
			var children = [];
			a.children && a.children.forEach(function (child) {
				children.push({
					class: recurseOnDefinition(child),
					child: child
				});
			});

			children.forEach(function(childStruct) {
				console.log(d.node_id + '->' + childStruct.class);
				var cardConstraint = parseCardinalityString(childStruct.child.occurrences || '0..1');
				cardConstraint.class = thisClass;
				cardConstraint.onProperty =  'RM:'+a.rm_attribute_name;
				cardConstraint.target =  childStruct.class;
				owlCardinality(cardConstraint);
				console.log(d.node_id + "."+JSON.stringify(cardConstraint));


				if (childStruct.class == 'RM:DV_CODED_TEXT') {
					var codesetName = classLabel['text'].replace(/\s/g, '').toLowerCase();
					var codeClass = owlClass(self.archetype_prefix+':'+codesetName+'_codeset');
					owlSubClassOf({class: codeClass, target: 'RM:CODE_PHRASE'});
					//console.log(JSON.stringify(childStruct.child.attributes[0].children[0].code_list));
					var validCodes = childStruct.child.attributes[0].children[0].code_list;
					var individuals = [];

					validCodes.forEach(function(c) {
						var codeLabel = getAttr(c);
						var e = owlCreateIndividual({class: codeClass, code: self.archetype_prefix+':'+c});
						owlAnnotation({property: 'rdfs:label', entity: e, value: codeLabel['text']});
						owlAnnotation({property: 'rdfs:comment', entity: e, value: codeLabel['description']});
						individuals.push(e);
					});
					//TODO: owlDifferentIndividuals(individuals);
					self.add_body_line('SubClassOf('+thisClass+' ObjectAllValuesFrom(RM:value ' + 
							   'ObjectExactCardinality(1 RM:defining_code '+codeClass+')))');
				}
			});
			
			var cardConstraint = parseCardinalityString(a.cardinality || '0..*');
			cardConstraint.class = thisClass;
			cardConstraint.onProperty =  'RM:'+a.rm_attribute_name;
			owlCardinality(cardConstraint);

		});

		return thisClass;
	};

	this.processArchetype = function(f) {
		var a = fs.readFileSync(f);
		var a = JSON.parse(a);
		console.log("PARSED ", a);
		var prefix = a.archetype_id.split('.').slice(-2).join('.');
		owlPrefix(prefix, 'http://cimi/archetypes/'+a.archetype_id+'#');
		
		self.archetype = a;
		self.archetype_prefix = prefix;
		
		var dclass = recurseOnDefinition(a.definition, prefix);
	}
};

exports.Ontology = Ontology;
