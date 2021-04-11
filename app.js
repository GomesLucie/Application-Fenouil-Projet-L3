if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
};

const express = require('express');
const morgan = require('morgan');
const mongoose = require('mongoose');
const Individu = require('./models/individu');
const Article = require('./models/article');
const Employee = require('./models/employee');
const Commande = require('./models/commande');
const Anomalie = require('./models/anomalie');
const CibleDeRoutage = require('./models/cibleDeRoutage');
const { render } = require('ejs');


//////////////////////////////////////////////
const multer = require('multer');
const path = require('path');
const uploadPath = path.join('public', Article.imageBasePath)
const imageMimeTypes = ['images/jpeg', 'images/jpg', 'images/png', 'images/gif']
const upload = multer({
    dest: uploadPath
        // fileFilter: (req, file, callback) => {
        //     callback(null, imageMimeTypes.includes(file.mimetype))
        // }
})

// //////////////////////////////////////////
const flash = require('express-flash');
const session = require('express-session');
const passport = require('passport');
const methodOverride = require('method-override');
const initializePassport = require('./passport-config');
const { result } = require('lodash');
const { db } = require('./models/individu');
const { authorize } = require('passport');
initializePassport(
    passport,
    identifiant => users.find(user => user.identifiant === identifiant),
    id => users.find(user => user.id === id)
);

///////////////////////////////////////////////

const users = [{ id: '1', identifiant: "winkler", mdp: "astrid" },
        { id: '2', identifiant: "lee", mdp: "jiou" },
        { id: '3', identifiant: "weber", mdp: "louise" },
        { id: '4', identifiant: "gomes", mdp: "lucie" },
        { id: '5', identifiant: "mohamed", mdp: "marwa" }
    ]
    ///////////////////////////////////////////////


// on créé une instance d'une application express
// permet de faciliter le routing
const app = express();

var server = app.listen(process.env.PORT || 3000, function () {
    var host = server.address().address
    var port = server.address().port
    console.log('App listening at http://%s:%s', host, port)
})


// Download a file
// Todo : Get data coming from Mongo
const data = { "foo": "bar" }; // JSON
app.get('/download-file', checkNotAuthenticated, (req, res) => {
    res.set("Content-Disposition", "attachment;filename=file.json");
    res.type("application/json");
    res.json(data);
});

//connect to database mongodb
const dbURI = 'mongodb+srv://mimirdev:mimir1234@fenouil.t2pik.mongodb.net/fenouil_app?retryWrites=true&w=majority';
mongoose.connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then((result) => console.log('Mongoose connected'))
    .catch((err) => console.log(err));

// register view engine
// configure quelques paramètres de l'application
app.set('view engine', 'ejs');

//midleware & static files
// rend disponible au front-end les fichiers contenus dans le folder public
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));


// Connexion à l'app
// avec utilisation package passeport
app.use(flash())
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}))

app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))

// requête de type app.get
// routing

app.get('/', checkNotAuthenticated, (req, res) => {
    res.render('Connexion', { title: 'Connexion' });
});

app.get('/acceuil', checkAuthenticated, (req, res) => {
    res.render('acceuil', { title: 'Accueil', style: 'acceuil' });
});

// Que fait l'appli en fonction de si authentification réussie ou pas
app.post('/', checkNotAuthenticated, passport.authenticate('local', {
    successRedirect: '/acceuil',
    failureRedirect: '/',
    failureFlash: true
}))

app.get('/referentiel', checkAuthenticated, (req, res) => {
    res.render('./adminRef/Referentiel', { title: 'Administration du référentiel', style: 'Referentiel' });
});

app.get('/referentielCreerArticle', checkAuthenticated, (req, res) => {
    try {
        const article = new Article();
        res.render('./adminRef/CreerArticle', {
            title: 'Administration du référentiel',
            style: 'Referentiel',
            article: article
        })
    } catch (err) {
        console.log(err);
    }
});

app.get('/referentielCreerIndividu', checkAuthenticated, (req, res) => {
    res.render('./adminRef/CreerIndividu', { title: 'Administration du référentiel', style: 'Referentiel' });
});

app.get('/commandes', checkAuthenticated, (req, res) => {
    res.render('./saisieCom/AcceuilCom', { title: 'Commandes', style: "Commande" })
})

app.get('/ajoutInd', checkAuthenticated, (req, res) => {
    res.render('./saisieCom/AjoutInd', { title: 'Commandes', style: "Commande" })
})

app.get('/creerCom', checkAuthenticated, async(req, res) => {
    const articles = await Article.find({})
    const individus = await Individu.find({})
    res.render('./saisieCom/CreerCom', { articles: articles, individus: individus, title: 'Commandes', style: "Commande" })
})

//créer un nouvel object commande selon la requête et l'ajoute à notre base de donnée
app.post('/creerCom', checkAuthenticated, async(req, res) => {
    const commande = new Commande(req.body);
    //pour récupérer la liste des prix des articles de notre commande
    const ids = commande.articles;
    const articles = await Article.find({ _id: { $in: ids } });
    const lprix = [];
    ids.forEach(id => {
        articles.forEach(article => {
            if (article.id == id) {
                lprix.push(article.prix);
            }
        });
    });

    commande.prix = calculPrix(lprix, commande.quantite);
    commande.numCommande = generateNumCom().toString();
    commande.etat = testAnomalie(commande);
    //console.log(commande);

    commande.save()
        .then((result) => {
            res.redirect('/creerCom');
        })
        .catch((err) => {
            console.log(err);
        });
});

function calculPrix(lprix, lquant) {
    let prix = 0;
    for (let i = 0; i < lprix.length; i++) {
        prix = prix + lprix[i] * lquant[i];
    }
    return prix;
}

function generateNumCom() {
    var num = Math.trunc(Math.random() * 100000000);
    while (num < 10000000) {
        num = num * 10;
    }
    return num;
}

function testAnomalie(com) {
    let etat = [];
    if (com.valeur == null) {
        etat.push("anoMontant");
    } else if (com.valeur != com.prix) {
        etat.push("anoMontant");
    }

    if (com.pCheque == null && com.pCarte == null) {
        etat.push("anoPaiement");
    } else if (com.pCheque == 'on') {
        if (com.numeroCheque == '') {
            etat.push("anoPaiement");
        } else if (com.banque == '') {
            etat.push("anoPaiement");
        }
        // else if(signature!="on"){
        //     etat.push("anoPaiement");
        // }
    }
    // else if(com.pCarte=='on'){
    //     if(numeroCarte==null){
    //         etat.push("anoPaiement");
    //     }
    //     else if(dateExpiration==null){
    //         etat.push("anoPaiement");
    //     }
    //     else if(dateExpiration!=null){
    //         let today=new Date().getTime();
    //     }
    // }
    return etat;
}

//créer un nouvel individu depuis l'espace saisie de commande
app.post('/ajoutInd', checkAuthenticated, (req, res) => {
    const individu = new Individu(req.body);
    individu.age = getAge(individu.dateNaissance)
    individu.save()
        .then((result) => {
            res.redirect('/creerCom');
        })
        .catch((err) => {
            console.log(err);
        });
});

// affiche liste de toutes les commandes de la base
//ordonés avec celle ajoutée le plus récemment en premier
app.get('/modifCom', checkAuthenticated, (req, res) => {
    let searchOptions = {}
    if (req.query.numCommande != null) {
        searchOptions.numCommande = new RegExp(req.query.numCommande);
    }
    Commande.find(searchOptions).sort({ createdAt: -1 })
        .then((result) => {
            res.render('./saisieCom/ModifCom', {
                title: 'Commandes',
                commandes: result,
                style: "Commande",
                searchOptions: req.query
            });
        })
        .catch((err) => {
            console.log(err);
        });
});
// affiche les informations de l'individu sélectionné
// dans la liste de recherche
app.get('/commande/:id', checkAuthenticated, async(req, res) => {
    try {
        const id = req.params.id;
        const com = await Commande.findById(id);
        let client = await Individu.findOne(com.client);
        let articles = await Article.find({ _id: { $in: com.articles } });
        res.render('./saisieCom/Commande', { commande: com, cl: client, larticles: articles, title: "Commande", style: "Commande" });
    } catch (err) {
        console.log(err);
    };
});

// supprime l'individu sélectionné
app.delete('/commande/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    Commande.findByIdAndDelete(id)
        .then(result => {
            res.json({ redirect: '/modifCom' });
        })
        .catch((err) => {
            console.log(err);
        });
});

//////// Prospection ////////
app.get('/prospection', checkAuthenticated, (req, res) => {
        res.render('./prospection/page', { title: 'Prospection', style: "prospection" })
    })
    //creer une cible de routage
app.post('/creationCiblederoutage', checkAuthenticated, async(req, res) => {
    const individus = await Individu.find({})
    const cibleDeRoutage = new CibleDeRoutage(req.body);
    const liste = new Array();
    individus.forEach(individu => {
        if (cibleDeRoutage.client === 'Non') {
            if ((individu.age <= cibleDeRoutage.ageMax) && (individu.age >= cibleDeRoutage.ageMin) && (individu.categoriePro === cibleDeRoutage.categoriePro) && (Math.floor(individu.adresseCode / 1000) === cibleDeRoutage.departementResidence) && (individu.statut === 'Enregistré')) {
                liste.push(individu._id)
            }
        } else {
            if ((individu.age <= cibleDeRoutage.ageMax) && (individu.age >= cibleDeRoutage.ageMin) && (individu.categoriePro === cibleDeRoutage.categoriePro) && (Math.floor(individu.adresseCode / 1000) === cibleDeRoutage.departementResidence) && (individu.statut === 'Client')) {
                liste.push(individu._id)
            }
        }

    })
    cibleDeRoutage.listeIndividus = liste
    cibleDeRoutage.save()
        //CibleDeRoutage.updateOne({_id: cibleDeRoutage._id}, {$set : {listeIndividus: liste}})
        .then((result) => {
            res.redirect('/creationCiblederoutage');
        })
        .catch((err) => {
            console.log(err);
        });
});
//recuperation liste articles pour creation cible de routage
app.get('/creationCiblederoutage', checkAuthenticated, async(req, res) => {
    try {
        const articles = await Article.find({})
            //const individus = await Individu.find({})
            //const cibleDeRoutage = new cibleDeRoutage()
        res.render('./prospection/new', {
            articles: articles,
            // individus : individus,
            //cibleDeRoutage: cibleDeRoutage
            title: 'Cibles de routage',
            style: "prospection"
        })
    } catch (err) {
        console.log(err);
    }
})
app.get('/validationCibleDeRoutage', checkAuthenticated, async(req, res) => {
    try {
        const cibleDeRoutages = await CibleDeRoutage.find({}).sort({ createdAt: -1 })
        res.render('./prospection/validate', {
            cibleDeRoutages: cibleDeRoutages,
            title: 'Cibles de routage',
            style: "prospection"
        })
    } catch (err) {
        console.log(err);
    }
})

app.get('/envoyerPublicite', checkAuthenticated, async(req, res) => {
    try {
        const cibleDeRoutages = await CibleDeRoutage.find({}).sort({ createdAt: -1 })
        const individus = await Individu.find({ _id: { $in: cibleDeRoutages.listeIndividus } })
        cibleDeRoutages.forEach(cible => {
            if (Math.abs(new Date() - cible.dateValide.getTime()) > 864000000) {
                individus.forEach(individu => {
                    individu.statut = 'Client'
                    individu.save()
                })
            }
        })

        res.render('./prospection/recuperer', {
            cibleDeRoutages: cibleDeRoutages,
            title: 'Cibles de routage',
            style: "prospection"
        })
    } catch (err) {
        console.log(err);
    }
})


app.get('/ciblederoutageRefuses', checkAuthenticated, async(req, res) => {
    try {
        const cibleDeRoutages = await CibleDeRoutage.find({}).sort({ createdAt: -1 })
        res.render('./prospection/visualiserRefuses', {
            cibleDeRoutages: cibleDeRoutages,
            title: 'Cibles de routage',
            style: "prospection"
        })
    } catch (err) {
        console.log(err);
    }
})

app.get('/ciblederoutageRefuses/:id', checkAuthenticated, async(req, res) => {
    try {
        const id = req.params.id;
        const cible = await CibleDeRoutage.findById(id)
        const articles = await Article.find({ _id: { $in: cible.articles } })
        const individus = await Individu.find({ _id: { $in: cible.listeIndividus } })
        res.render('./prospection/modif', { cible: cible, articles: articles, individus: individus, title: 'cible de routage', style: "prospection" });
    } catch (error) {
        console.log(err);
    }
});

app.delete('/ciblederoutageRefuses/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    CibleDeRoutage.findByIdAndDelete(id)
        .then(result => {
            res.json({ redirect: '/ciblederoutageRefuses' });
        })
        .catch((err) => {
            console.log(err);
        });
});

app.get('/validationCiblederoutage/:id', checkAuthenticated, async(req, res) => {

    try {
        const id = req.params.id;
        const cible = await CibleDeRoutage.findById(id)
        const articles = await Article.find({ _id: { $in: cible.articles } })
        const individus = await Individu.find({ _id: { $in: cible.listeIndividus } })
        res.render('./prospection/details', { cible: cible, articles: articles, individus: individus, title: 'cible de routage', style: "prospection" });
    } catch (error) {
        console.log(err);
    }

});
app.delete('/validationCiblederoutage/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    CibleDeRoutage.findByIdAndDelete(id)
        .then(result => {
            res.json({ redirect: '/validationCiblederoutage' });
        })
        .catch((err) => {
            console.log(err);
        });
});

app.put('/validationCiblederoutage/:id', checkAuthenticated, async(req, res) => {

    try {
        const id = req.params.id;
        const cible = await CibleDeRoutage.findById(id)
        const individus = await Individu.find({ _id: { $in: cible.listeIndividus } })

        individus.forEach(individu => {
                individu.statut = 'Prospect'
                individu.save()
            })
            // await individus.save()
        cible.valide = true
        cible.dateValide = new Date()
        cible.refus = false
        cible.save()
            //await CibleDeRoutage.findByIdAndUpdate(id,{valide: true, dateValide: new Date(), refus: false })
        res.redirect('/validationCiblederoutage');
    } catch (error) {
        console.log(err);
    }
});

app.post('/validationCiblederoutage/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    const remarque = req.remarque
    console.log(remarque)
    CibleDeRoutage.findByIdAndUpdate(id, { refus: true, remarque: remarque })
        .then(result => {
            res.redirect('/validationCiblederoutage');
        })
        .catch((err) => {
            console.log(err);
        });
});

//////// Administration du Référentiel ////////

// affiche liste de tous les articles de la base
//ordonés avec celui ajouté le plus récemment en premier
app.get('/anomalies', checkAuthenticated, (req, res) => {
    let searchOptions = {};
    if ( /*req.query.reference != null &&*/ req.query.numeroCom != null) {
        //searchOptions.reference= new RegExp(req.query.reference, 'i');
        searchOptions.numeroCom = new RegExp(req.query.numeroCom, 'i');
    }
    Anomalie.find(searchOptions).sort({ createdAt: -1 })
        .then((result) => {
            res.render('anomalie', {
                title: 'Gestion des Anomalies',
                anomalies: result,
                style: "anomalie",
                searchOptions: req.query
            });
        })
        .catch((err) => {
            console.log(err);
        });
});

// affiche liste de tous les individus de la base
//ordonés avec celui ajouté le plus récemment en premier
app.get('/recherche', checkAuthenticated, (req, res) => {
    let searchOptions = {}
    if (req.query.nom != null && req.query.prenom != null) {
        searchOptions.nom = new RegExp(req.query.nom, 'i');
        searchOptions.prenom = new RegExp(req.query.prenom, 'i')
    }
    Individu.find(searchOptions).sort({ createdAt: -1 })
        .then((result) => {
            res.render('recherche', {
                title: 'Liste individus',
                individus: result,
                style: "recherche",
                searchOptions: req.query
            });
        })
        .catch((err) => {
            console.log(err);
        });
});

// ajoute un individu à la base de données
// fait marcher le bouton submit en soi
// puis redirige vers la page administrateur
app.post('/referentielCreerIndividu', checkAuthenticated, (req, res) => {
    const individu = new Individu(req.body);
    individu.age = getAge(individu.dateNaissance)
    individu.save()
        .then((result) => {
            res.redirect('/referentiel');
        })
        .catch((err) => {
            console.log(err);
        });
});

function getAge(date) {
    var diff = Date.now() - date.getTime();
    var age = new Date(diff);
    return Math.abs(age.getUTCFullYear() - 1970);
}

// créer un nouvel article
app.post('/referentielCreerArticle', checkAuthenticated, upload.single('image'), async(req, res) => {
    const fileName = req.file != null ? req.file.filename : null;
    const article = new Article({
        designation: req.body.designation,
        prix: req.body.prix,
        nomImage: fileName,
        description: req.body.description
    })
    article.reference = generateRef();
    article.save()
        .then((result) => {
            res.redirect('/referentiel');
        })
        .catch((err) => {
            console.log(err);
        });
});

function generateRef() {
    var num = Math.trunc(Math.random() * 100000000);
    while (num < 10000000) {
        num = num * 10;
    }
    return num;
}

// affiche les informations d'un seul individu sélectionné
// dans la liste de recherche
app.get('/recherche/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    Individu.findById(id)
        .then(result => {
            res.render('details', { individu: result, title: "Détails individu", style: "recherche" });
        })
        .catch((err) => {
            console.log(err);
        });
});


// supprime un des individus sélectionné
app.delete('/recherche/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    Individu.findByIdAndDelete(id)
        .then(result => {
            res.json({ redirect: '/recherche' });
        })
        .catch((err) => {
            console.log(err);
        });
});

// affiche liste de tous les articles de la base
//ordonés avec celui ajouté le plus récemment en premier
app.get('/referentielModifArticle', checkAuthenticated, (req, res) => {
    let searchOptions = {};
    if (req.query.reference != null && req.query.designation != null) {
        searchOptions.reference = new RegExp(req.query.reference);
        searchOptions.designation = new RegExp(req.query.designation, 'i');
    }
    Article.find(searchOptions).sort({ createdAt: -1 })
        .then((result) => {
            res.render('./adminRef/ModifArticle', {
                title: 'Administration du référentiel',
                articles: result,
                style: "Referentiel",
                searchOptions: req.query
            });
        })
        .catch((err) => {
            console.log(err);
        });
});

// affiche les informations d'un seul article sélectionné
// dans la liste de recherche
app.get('/referentielArticle/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    Article.findById(id)
        .then(result => {
            res.render('./adminRef/Article', { article: result, title: "Administration du référentiel", style: "Referentiel" });
        })
        .catch((err) => {
            console.log(err);
        });
});

app.put('/referentielArticle/:id', checkAuthenticated, async(req, res) => {
    let article
    try {
        article = await Article.findById(req.params.id)
        article.designation = req.body.designation
        article.prix = req.body.prix
        article.description = req.body.description
        await article.save()
        res.redirect('/referentielModifArticle')
    } catch {
        res.redirect('/referentiel')
    }
})

// supprime l'article sélectionné
app.delete('/referentielModifArticle/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    Article.findByIdAndDelete(id)
        .then(result => {
            res.json({ redirect: '/referentielModifArticle' });
        })
        .catch((err) => {
            console.log(err);
        });
});

// affiche liste de tous les individu de la base
//ordonés avec celui ajouté le plus récemment en premier
app.get('/referentielModifIndividu', checkAuthenticated, (req, res) => {
    let searchOptions = {};
    console.log(req.query);
    if (req.query.nom != null && req.query.prenom != null && req.query.dateNaissance != null) {
        if (req.query.dateNaissance != '') {
            searchOptions.dateNaissance = req.query.dateNaissance;
        }
        searchOptions.nom = new RegExp(req.query.nom, 'i');
        searchOptions.prenom = new RegExp(req.query.prenom, 'i');
    }
    console.log(searchOptions);
    Individu.find(searchOptions).sort({ createdAt: -1 }).limit(10)
        .then((result) => {
            res.render('./adminRef/ModifIndividu', {
                title: 'Administration du référentiel',
                individus: result,
                style: "Referentiel",
                searchOptions: req.query
            });
        })
        .catch((err) => {
            console.log(err);
        });
});

// affiche les informations de l'individu sélectionné
// dans la liste de recherche
app.get('/referentielIndividu/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    Individu.findById(id)
        .then(result => {
            res.render('./adminRef/Individu', { individu: result, title: "Administration du référentiel", style: "Referentiel" });
        })
        .catch((err) => {
            console.log(err);
        });
});

app.put('/referentielIndividu/:id', checkAuthenticated, async(req, res) => {
    let individu
    try {
        individu = await Individu.findById(req.params.id)
        individu.nom = req.body.nom
        individu.prenom = req.body.prenom
            //individu.dateNaissance = req.body.dateNaissance
        individu.categoriePro = req.body.categoriePro
        individu.adresseNum = req.body.adresseNum
        individu.adresseType = req.body.adresseType
        individu.adresseCode = req.body.adresseCode
        individu.adresseVille = req.body.adresseVille
        individu.adresseInfos = req.body.adresseInfos
        individu.adresseMail = req.body.adresseMail
        individu.numeroTel = req.body.numeroTel
        individu.statut = req.body.statut
        await individu.save()
        res.redirect('/referentielModifIndividu')
    } catch {
        res.redirect('/referentiel')
    }
})

// supprime l'individu sélectionné
app.delete('/referentielModifIndividu/:id', checkAuthenticated, (req, res) => {
    const id = req.params.id;
    Individu.findByIdAndDelete(id)
        .then(result => {
            res.json({ redirect: '/referentielModifIndividu' });
        })
        .catch((err) => {
            console.log(err);
        });
});

// permet de se déconnecter (revient à page de connexion)
app.delete('/logout', checkAuthenticated, (req, res) => {
    req.logOut()
    res.redirect('/')
})

// permet l'accès à certaines pages en fonction de statut authentification
function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next()
    }
    res.redirect('/')
}

function checkNotAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/acceuil')
    }
    next()
}

// 404 page
// use: fonction middleware qui marche que si les options du dessus 
// n'ont pas été validées, eut-être placée à n'importe quel endroit
app.use((req, res) => {
    res.status(404).render('404', { title: '404 Error', style: "styles" });

});