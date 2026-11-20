import type {
  AlertCategory,
  AlertSeverity,
  OpportunityCategory,
  ProCategory,
  ProPricingMode,
  ProStyleSample,
} from "./types";

export interface ProServiceSeed {
  title: string;
  category: string;
  description: string;
  deliverables: string[];
  duration_label: string;
  price_millimes: number | null;
  price_display: string;
  floor_millimes: number | null;
  pricing_mode: ProPricingMode;
  intake_questions: string[];
  prep_or_details_template: string;
  booking_url?: string | null;
}

export interface ProOpportunitySeed {
  source: "dm" | "board";
  title: string;
  brand_or_client: string;
  category: OpportunityCategory;
  description: string;
  compensation_text: string;
  budget_millimes: number | null;
  fit_score: number;
  urgency: "low" | "medium" | "high" | "critical";
  fit_reasons: string[];
  draft_pitch: string;
}

export interface ProAlertSeed {
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  summary: string;
  recommended_action: string;
  draft_reply: string;
}

export interface ProPresetPack {
  id: ProCategory;
  label: string;
  shortLabel: string;
  tagline: string;
  defaultDisplayName: string;
  headline: string;
  bio: string;
  locationCity: string;
  clinicOrStudioAddress: string;
  lat: number;
  lng: number;
  styleRules: string;
  boundariesNote: string;
  styleSamples: ProStyleSample[];
  opportunityGoals: string;
  opportunityKeywords: string[];
  minDealBudgetMillimes: number | null;
  services: ProServiceSeed[];
  sampleOpportunities: ProOpportunitySeed[];
  sampleAlert: ProAlertSeed;
  welcomeBriefing: {
    headline: string;
    highlights: string[];
    actionItems: string[];
  };
}

export const PRO_PRESETS: Record<ProCategory, ProPresetPack> = {
  doctor: {
    id: "doctor",
    label: "Doctor / Medical Clinic",
    shortLabel: "Doctor / Clinic",
    tagline: "Patient DM intake, appointment prep, clinic pin & urgent medical triage alerts.",
    defaultDisplayName: "Dr. Amine Ben Amor",
    headline: "General & Preventive Medicine · Les Berges du Lac, Tunis",
    bio: "Cabinet médical au Lac 2 (Tunis). Consultations sur rendez-vous, bilans préventifs et téléconsultations de suivi. Réponses bienveillantes en Derja tunisienne et Français.",
    locationCity: "Tunis",
    clinicOrStudioAddress: "Immeuble Médical Le Lac, Rue du Lac Leman, Les Berges du Lac 2, Tunis",
    lat: 36.8434,
    lng: 10.2712,
    styleRules:
      "Warm, calm, reassuring Tunisian doctor tone. Mix clear French medical vocabulary with polite Tunisian Derja (Arabizi or Arabic script depending on patient). Always concise and respectful.",
    boundariesNote:
      "STRICT SAFETY: Never diagnose a condition, never prescribe or change medication dosage over DM. For any emergency symptom (chest pain, breathing trouble, severe bleeding, loss of consciousness, high fever in infant), immediately instruct the patient to call SAMU 190 or go to the nearest ER and raise a CRITICAL alert.",
    styleSamples: [
      {
        situation: "Patient asking for consultation appointment and fee in Derja",
        reply:
          "Ahla bik! El consultation fel cabinet (Lac 2) b 80DT. A3tini esmek, numrok (+216), w el nhar elli ysa3dek (sbah walla 3chiya) bch nsajel el demande mte3ek.",
      },
      {
        situation: "Patient asking about follow-up teleconsultation in French",
        reply:
          "Bonjour, oui nous faisons des téléconsultations de suivi (60DT) uniquement pour les patients déjà vus au cabinet ou pour lecture de bilan. Envoyez-moi votre nom, numéro et le créneau souhaité.",
      },
    ],
    opportunityGoals:
      "Medical podcast & TV health interviews in Tunisia, corporate wellness workshops, private clinic collaborations, and medical conference panels.",
    opportunityKeywords: ["podcast", "interview", "conférence", "séminaire", "clinique", "entreprise", "santé", "tv", "radio"],
    minDealBudgetMillimes: 500_000,
    services: [
      {
        title: "Consultation au Cabinet",
        category: "consultation",
        description: "Consultation médicale complète au cabinet (Lac 2, Tunis) avec examen clinique et bilan.",
        deliverables: ["Examen clinique complet", "Ordonnance / bilan si nécessaire", "Compte-rendu de suivi"],
        duration_label: "30 min",
        price_millimes: 80_000,
        price_display: "80DT",
        floor_millimes: 80_000,
        pricing_mode: "fixed",
        intake_questions: [
          "Nom complet du patient",
          "Numéro de téléphone tunisien (+216)",
          "Jour et créneau souhaité (matin / après-midi)",
          "Motif bref de la visite (sans urgence vitale)",
        ],
        prep_or_details_template:
          "Cabinet Dr. Amine Ben Amor — Immeuble Médical Le Lac, Lac 2, Tunis. Tarif : 80DT. Merci d'apporter votre carte CNAM (si applicable) et vos anciennes analyses 10 min avant l'heure confirmée.",
      },
      {
        title: "Téléconsultation & Lecture de Bilan",
        category: "teleconsultation",
        description: "Visio sécurisée pour lecture d'analyses récentes ou suivi d'un dossier déjà ouvert.",
        deliverables: ["Appel vidéo 20 min", "Interprétation des analyses", "Plan de suivi écrit"],
        duration_label: "20 min",
        price_millimes: 60_000,
        price_display: "60DT",
        floor_millimes: 60_000,
        pricing_mode: "fixed",
        intake_questions: [
          "Nom complet",
          "Numéro WhatsApp (+216)",
          "Photo claire des analyses / bilan si disponible",
          "Créneau préféré",
        ],
        prep_or_details_template:
          "Téléconsultation (60DT · 20 min). Envoyez vos analyses à l'avance et nous confirmons le lien vidéo dès validation du créneau par le secrétariat.",
      },
      {
        title: "Bilan Préventif & Certificat Médical",
        category: "checkup",
        description: "Bilan général (sport, travail, voyage) avec électrocardiogramme de repos si indiqué.",
        deliverables: ["Examen complet", "Certificat officiel", "Recommandations préventives"],
        duration_label: "40 min",
        price_millimes: 110_000,
        price_display: "110DT",
        floor_millimes: 100_000,
        pricing_mode: "fixed",
        intake_questions: ["Nom complet", "Numéro (+216)", "Type de certificat demandé", "Date souhaitée"],
        prep_or_details_template:
          "Bilan préventif & certificat (110DT · 40 min). Venez muni de votre CIN et de tout document médical récent.",
      },
    ],
    sampleOpportunities: [
      {
        source: "board",
        title: "Intervenant Santé Préventive — Journée Bien-Être Entreprise (Tunis)",
        brand_or_client: "TechPark El Ghazala · RH",
        category: "medical_talk",
        description:
          "Atelier interactif de 60 min pour 80 collaborateurs sur la gestion du stress, le sommeil et les bilans préventifs en Tunisie.",
        compensation_text: "1200DT honoraires",
        budget_millimes: 1_200_000,
        fit_score: 92,
        urgency: "high",
        fit_reasons: [
          "Matches preventive medicine specialty in Greater Tunis",
          "Budget (1200DT) exceeds minimum honorarium floor",
          "High local visibility with corporate audience",
        ],
        draft_pitch:
          "Bonjour l'équipe TechPark, je suis Dr. Amine Ben Amor (médecine générale & préventive, Lac 2). Votre atelier bien-être correspond exactement à mes interventions en entreprise. Je peux animer une session pratique de 60 min (sommeil, stress, bilans clés) avec Q&R. Disponible pour caler un bref appel cette semaine ?",
      },
      {
        source: "dm",
        title: "Invité Podcast Santé Tunis — Épisode Prévention & Hygiène de Vie",
        brand_or_client: "Tunis Wellness Podcast",
        category: "partnership",
        description: "Invitation vidéo (45 min studio La Marsa) pour vulgariser la prévention santé en Derja + Français.",
        compensation_text: "Exposition média + clips sociaux",
        budget_millimes: null,
        fit_score: 84,
        urgency: "medium",
        fit_reasons: [
          "Matches podcast/media interview goal",
          "Studio located nearby in La Marsa",
        ],
        draft_pitch:
          "Ahla bikom! Merci 3al invitation — el sujet mta3 el prévention yhemm barcha el touansa. Ab3athouli les créneaux disponibles fel studio fel Marsa w nchouf m3a el agenda mte3i.",
      },
    ],
    sampleAlert: {
      severity: "urgent",
      category: "opportunity_match",
      title: "High-fit corporate wellness talk (1,200 DT) closing soon",
      summary: "TechPark El Ghazala is looking for a Tunis physician for a 60-min preventive health session (92% match).",
      recommended_action: "Review the AI-drafted pitch and apply directly from Opportunities.",
      draft_reply:
        "Bonjour, je confirme mon intérêt pour animer la session bien-être à El Ghazala. Voici mes créneaux disponibles la semaine prochaine.",
    },
    welcomeBriefing: {
      headline: "Your clinic DM desk & triage radar are active for Tunis.",
      highlights: [
        "3 clinic services loaded with DT pricing and patient intake slots",
        "SAMU 190 emergency red-flag escalation rule armed",
        "2 local Tunis opportunities matched (top fit: 92%)",
      ],
      actionItems: [
        "Verify your clinic address, consultation hours, and +216 WhatsApp alert phone in My Style & AI",
        "Review the 1,200 DT TechPark wellness talk pitch in Opportunities",
      ],
    },
  },

  cameraman: {
    id: "cameraman",
    label: "Cameraman / Photographer / Media",
    shortLabel: "Cameraman / Media",
    tagline: "Discuss shoot packages, gear & dates in your style + spot high-budget briefs.",
    defaultDisplayName: "Youssef Khelifi Studio",
    headline: "Commercial Videographer & Photographer · Tunis · Sousse · Djerba",
    bio: "Réalisateur, cadreur 4K & drone certifié. Clips marques, reels Instagram/TikTok, couvertures mariages/outia et shootings produits partout en Tunisie.",
    locationCity: "Tunis",
    clinicOrStudioAddress: "Studio Khelifi, Ennasr 2, Ariana, Tunisie",
    lat: 36.8615,
    lng: 10.1623,
    styleRules:
      "Creative, confident, friendly Tunisian videographer vibe. Use natural Derja + French production terms (shooting, montage, étalonnage, drone, rushs, devis). Ask concise project scoping questions before sending package details.",
    boundariesNote:
      "Never quote below a package's floor_millimes. Never confirm a date as locked until the cameraman personally approves the booking and deposit (30% avance).",
    styleSamples: [
      {
        situation: "Client asking for brand reel shoot price in Derja",
        reply:
          "Ahla khoya! El pack Brand Reel (tournage 4K + montage + color grading) yabda men 650DT. 9olli chnowa el produit, win el tournage, w 9addech men vidéo t7eb bch na3tik devis mrigel.",
      },
      {
        situation: "Client asking about wedding / outia coverage",
        reply:
          "Mabrouk mo9addaman! Nkhdem mariages w outia fi Tunis, Hammamet w Sousse. El pack complet (2 caméras + drone + film 4K + teaser) b 1800DT. Ab3athli date el 3ers w el salle bch nchouf el disponibilité.",
      },
    ],
    opportunityGoals:
      "Paid commercial brand shoots, hotel/restaurant visual retainers in Tunis/Hammamet/Sousse/Djerba, music videos, and destination wedding productions >= 700 DT.",
    opportunityKeywords: ["tournage", "shooting", "reel", "pub", "commercial", "drone", "mariage", "clip", "montage", "hôtel", "campagne"],
    minDealBudgetMillimes: 700_000,
    services: [
      {
        title: "Pack Brand Reels (3 Vidéos 4K)",
        category: "commercial",
        description: "Demi-journée tournage 4K + éclairage pro + montage dynamique + sound design pour marques tunisiennes.",
        deliverables: ["3 Reels verticaux 4K (15–45s)", "Étalonnage couleur + sous-titres", "Livraison sous 72h"],
        duration_label: "4 heures tournage",
        price_millimes: 750_000,
        price_display: "750DT",
        floor_millimes: 650_000,
        pricing_mode: "starting_at",
        intake_questions: [
          "Nom de la marque / projet",
          "Date et lieu du tournage (ville / studio)",
          "Nombre de vidéos ou photos souhaité",
          "Numéro WhatsApp (+216) + budget indicatif",
        ],
        prep_or_details_template:
          "Pack Brand Reels (750DT · min 650DT). Inclut 4h tournage 4K, éclairage studio, montage & étalonnage de 3 Reels livrés sous 72h. Réservation confirmée après validation date + avance 30%.",
      },
      {
        title: "Couverture Mariage / Outia Cinéma",
        category: "event",
        description: "Captation multi-caméras cinéma, audio pro, plans drone (selon lieu) et montage film + teaser Instagram.",
        deliverables: ["Teaser 90s sous 5 jours", "Film complet 4K", "150 photos retouchées (option)"],
        duration_label: "Journée / Soirée",
        price_millimes: 1_800_000,
        price_display: "1800DT",
        floor_millimes: 1_550_000,
        pricing_mode: "starting_at",
        intake_questions: [
          "Date exacte du mariage / outia",
          "Ville et salle / hôtel",
          "Besoin photo + vidéo ou vidéo seule ?",
          "Numéro de contact (+216)",
        ],
        prep_or_details_template:
          "Pack Mariage Cinéma (à partir de 1800DT). 2 caméras 4K + stabilisation + teaser 90s + film complet. Déplacement hors Grand Tunis sur devis.",
      },
      {
        title: "Shooting Produit E-Commerce / Studio",
        category: "studio",
        description: "Photos haute résolution + courtes vidéos produits pour boutiques Instagram et sites web.",
        deliverables: ["25 photos retouchées HD", "2 vidéos macro produit", "Formats 4:5 et 9:16"],
        duration_label: "3 heures studio",
        price_millimes: 450_000,
        price_display: "450DT",
        floor_millimes: 400_000,
        pricing_mode: "fixed",
        intake_questions: ["Nombre de produits", "Style souhaité (studio blanc / lifestyle)", "Date souhaitée", "Numéro (+216)"],
        prep_or_details_template:
          "Shooting Produit Studio Ennasr 2 (450DT · 25 photos HD + 2 clips). Déposez vos produits 24h avant ou assistez au shoot.",
      },
    ],
    sampleOpportunities: [
      {
        source: "board",
        title: "Campagne Vidéo Boutique Hôtel — Hammamet (2 Jours + Drone)",
        brand_or_client: "Dar Jasmin Hospitality",
        category: "shoot",
        description:
          "Recherche vidéaste pro pour 1 film vitrine (90s) + 5 Reels verticaux + plans drone lever du soleil à Hammamet.",
        compensation_text: "2,600 DT + hébergement",
        budget_millimes: 2_600_000,
        fit_score: 95,
        urgency: "high",
        fit_reasons: [
          "Matches 4K commercial + drone skill set",
          "Budget (2,600 DT) well above 700 DT floor",
          "Strong hospitality portfolio asset in Hammamet",
        ],
        draft_pitch:
          "Bonjour l'équipe Dar Jasmin ! Je suis Youssef Khelifi (vidéaste 4K & drone, Studio Ennasr 2). Votre brief Hammamet (film 90s + 5 Reels + drone sunrise) correspond parfaitement à mes productions hôtelières. Je peux vous envoyer mon showreel et bloquer 2 jours dès cette quinzaine — on se parle sur WhatsApp ?",
      },
      {
        source: "dm",
        title: "Retainer Mensuel Reels — Marque Streetwear Tunis",
        brand_or_client: "Medina Wear TN",
        category: "shoot",
        description: "DM entrant : besoin de 6 Reels/mois (shooting extérieur La Marsa / Lac) sur 3 mois.",
        compensation_text: "1,400 DT / mois",
        budget_millimes: 1_400_000,
        fit_score: 88,
        urgency: "medium",
        fit_reasons: [
          "Recurring 3-month retainer (4,200 DT total)",
          "Local Tunis shooting locations",
        ],
        draft_pitch:
          "Ahla équipe Medina Wear! Top el idée mta3 el retainer 6 Reels/mois. Nnajmou n7adhrou 1 journée tournage/mois fel Marsa/Lac b qualité cinéma 4K + livraison rapide. T7ebbou ntalkaw call sghir el youm bch nfixiw el planning ?",
      },
    ],
    sampleAlert: {
      severity: "urgent",
      category: "vip_quote",
      title: "2,600 DT Hammamet hotel shoot brief (95% match)",
      summary: "Dar Jasmin Hospitality needs a 4K + drone videographer for a 2-day shoot. Pitch drafted in your voice.",
      recommended_action: "Review the pitch & portfolio link in Opportunities and send before the deadline.",
      draft_reply:
        "Bonjour Dar Jasmin, merci pour le brief ! Je suis disponible pour le tournage 2 jours à Hammamet avec 4K + drone. Voici mon showreel.",
    },
    welcomeBriefing: {
      headline: "Your studio DM assistant & shoot radar are ready.",
      highlights: [
        "3 video/photo packages configured with floor prices in DT",
        "Auto-scoping asks clients for date, venue, deliverables & +216 phone",
        "2 paid Tunisian shoot opportunities spotted (up to 2,600 DT)",
      ],
      actionItems: [
        "Add your showreel link and real DM reply samples in My Style & AI",
        "Approve & apply to the 2,600 DT Hammamet hotel brief",
      ],
    },
  },

  creator: {
    id: "creator",
    label: "Public Figure / Content Creator",
    shortLabel: "Public Figure / Creator",
    tagline: "Filter noisy fan DMs, negotiate brand deals at your rate floor & spot collabs.",
    defaultDisplayName: "Ines Mansour",
    headline: "Lifestyle & Tech Creator · 180K Followers · Tunisia",
    bio: "Créatrice de contenu tunisienne (Instagram, TikTok & YouTube). Collaborations marques, UGC authentique en Derja/Français, présentations événements & campagnes ambassadrice.",
    locationCity: "Tunis",
    clinicOrStudioAddress: "Tunis · Disponible Grand Tunis & déplacements",
    lat: 36.8065,
    lng: 10.1815,
    styleRules:
      "Warm, charismatic, authentic Tunisian creator voice. Friendly and appreciative with fans in Derja; sharp, structured, and professional with brands/agencies in French/English/Derja. Never sound robotic.",
    boundariesNote:
      "Never accept gifted-only deals when the brand asks for dedicated Reels or ad usage rights. Never quote below floor_millimes. Never sign or promise exclusivity without creator approval.",
    styleSamples: [
      {
        situation: "Brand DM asking for a sponsored Reel rate",
        reply:
          "Ahla bikom! Merci barcha 3al message. Pour un Reel sponsorisé dédié (tournage + montage + 3 Stories avec lien), mon tarif démarre à 1200DT. Ab3athouli el brief, el produit w el deadline bch nchouf ken ymatchi m3a ma communauté!",
      },
      {
        situation: "Warm fan DM asking a casual question",
        reply:
          "3aychek barcha ya ghali(a)! Farra7tni b messagek — inchallah el vidéo el jeya tahbet nhar el jem3a!",
      },
    ],
    opportunityGoals:
      "Paid sponsorships with Tunisian & MENA tech, beauty, travel, and fintech brands; paid UGC packs; keynote/event hosting; long-term ambassadorships >= 800 DT.",
    opportunityKeywords: ["collab", "collaboration", "sponsor", "partenariat", "campagne", "ugc", "ambassadrice", "événement", "budget", "brand", "brief"],
    minDealBudgetMillimes: 800_000,
    services: [
      {
        title: "Sponsored Reel + 3 Stories Pack",
        category: "sponsorship",
        description: "1 Reel dédié tourné & monté en Derja/Français + 3 Stories avec lien cliquable et tag marque.",
        deliverables: ["1 Reel Instagram/TikTok (30–60s)", "3 Stories avec lien/sticker", "Rapport stats à J+7"],
        duration_label: "Livraison 5 jours",
        price_millimes: 1_200_000,
        price_display: "1200DT",
        floor_millimes: 950_000,
        pricing_mode: "starting_at",
        intake_questions: [
          "Nom de la marque & produit",
          "Objectif & messages clés du brief",
          "Date de publication souhaitée",
          "Droits pub (Whitelisting / Paid Ads) demandés ? + Budget",
        ],
        prep_or_details_template:
          "Pack Sponsored Reel + 3 Stories (1200DT · droits organiques inclus, Paid Ads en option). Validation du script avant tournage, livraison sous 5 jours après réception du produit.",
      },
      {
        title: "Pack UGC Marque (Sans Publication)",
        category: "ugc",
        description: "2 vidéos UGC natives en Derja tunisienne optimisées pour vos campagnes Meta/TikTok Ads.",
        deliverables: ["2 vidéos UGC (2 hooks différents)", "Droits Paid Ads 3 mois", "Sous-titres inclus"],
        duration_label: "Livraison 4 jours",
        price_millimes: 850_000,
        price_display: "850DT",
        floor_millimes: 750_000,
        pricing_mode: "fixed",
        intake_questions: ["Produit / lien boutique", "Langue (Derja / Français)", "Deadline", "Contact WhatsApp (+216)"],
        prep_or_details_template:
          "Pack 2 Vidéos UGC Ads (850DT · droits publicitaires 3 mois inclus). Script envoyé pour validation sous 48h.",
      },
      {
        title: "Présence Événement / Hosting",
        category: "appearance",
        description: "Présence lancement boutique/produit à Tunis + couverture Stories live + Reel récap.",
        deliverables: ["Présence 2h sur place", "5 Stories live", "1 Reel récapitulatif"],
        duration_label: "2 heures + contenu",
        price_millimes: 1_500_000,
        price_display: "1500DT",
        floor_millimes: 1_200_000,
        pricing_mode: "custom_quote",
        intake_questions: ["Date et lieu de l'événement", "Rôle attendu (invitée / animation)", "Contact organisateur (+216)"],
        prep_or_details_template:
          "Couverture & Présence Événement (à partir de 1500DT sur Grand Tunis). Confirmé après accord sur l'agenda et le brief.",
      },
    ],
    sampleOpportunities: [
      {
        source: "board",
        title: "Campagne Lancement App Paiement Mobile — Créateurs Tunisie",
        brand_or_client: "PayTunisia Fintech",
        category: "sponsorship",
        description:
          "Recherche créateur/créatrice tech & lifestyle tunisien(ne) pour 2 Reels pédagogiques en Derja + Stories lien téléchargement.",
        compensation_text: "2,800 DT forfait",
        budget_millimes: 2_800_000,
        fit_score: 96,
        urgency: "high",
        fit_reasons: [
          "Exact match with Tunisian tech & lifestyle audience",
          "2,800 DT exceeds 800 DT minimum deal budget by 3.5x",
          "Clear deliverables with high conversion angle in Derja",
        ],
        draft_pitch:
          "Bonjour l'équipe PayTunisia ! Je suis Ines Mansour (180K abonnés Tunisie, tech & lifestyle). Votre campagne lancement en Derja matche exactement mon audience jeune et connectée. Je peux proposer 2 Reels pédagogiques très naturels + Stories lien tracké. On échange le media kit ?",
      },
      {
        source: "dm",
        title: "Demande Pack UGC — Marque Cosmétique Naturelle (Sousse)",
        brand_or_client: "Saffron & Olive TN",
        category: "sponsorship",
        description: "DM entrant : cherche 3 vidéos UGC en Derja pour lancement Meta Ads avant Ramadan.",
        compensation_text: "1,100 DT proposé",
        budget_millimes: 1_100_000,
        fit_score: 87,
        urgency: "medium",
        fit_reasons: [
          "Matches UGC pack offer above 750 DT floor",
          "Clear budget stated upfront in DM",
        ],
        draft_pitch:
          "Ahla équipe Saffron & Olive! Merci 3al message — el produit ychahhi w nkhdem barcha UGC en Derja pour Meta Ads. À 1,100DT najem na3malkom 3 vidéos avec hooks différents + droits Ads 3 mois. Ab3athouli el brief ?",
      },
    ],
    sampleAlert: {
      severity: "urgent",
      category: "opportunity_match",
      title: "2,800 DT Fintech sponsorship (96% fit) needs your review",
      summary: "PayTunisia Fintech wants 2 Derja Reels + Stories. Your AI drafted a pitch ready to send.",
      recommended_action: "Review the pitch and click Apply in Opportunities.",
      draft_reply:
        "Bonjour PayTunisia, ravie de découvrir votre campagne ! Voici mon media kit et mes disponibilités cette semaine.",
    },
    welcomeBriefing: {
      headline: "Your creator DM filter & brand-deal radar are live.",
      highlights: [
        "3 creator packages & rate floors configured (750DT – 1,500DT)",
        "Fan DMs answered warmly while commercial briefs are auto-extracted",
        "2 Tunisian brand opportunities scored (top fit: 96% · 2,800 DT)",
      ],
      actionItems: [
        "Paste 2–3 real DM replies you wrote in My Style & AI to clone your exact tone",
        "Review the 2,800 DT PayTunisia brief in Opportunities",
      ],
    },
  },

  custom: {
    id: "custom",
    label: "Custom Service Provider",
    shortLabel: "Custom Pro",
    tagline: "Consultants, coaches, architects, lawyers, agencies — define any service & voice.",
    defaultDisplayName: "My Pro Desk",
    headline: "Independent Professional · Tunisia",
    bio: "Prestataire de services en Tunisie. Réponses personnalisées aux DMs, discussion des besoins clients, envoi de devis/détails et détection d'opportunités.",
    locationCity: "Tunis",
    clinicOrStudioAddress: "Tunis, Tunisie",
    lat: 36.8065,
    lng: 10.1815,
    styleRules:
      "Clear, polite, direct Tunisian professional tone (Derja, French, Arabic, or English mirroring the client). Gather requirements before quoting.",
    boundariesNote:
      "Never commit to a binding contract or quote below floor_millimes without human confirmation.",
    styleSamples: [
      {
        situation: "New client asking about services",
        reply:
          "Marhba bik! A3tini fikra sghira 3al besoin mte3ek, el délai w el budget approximatif bch nab3athlek les détails w na3mlou point rapide.",
      },
    ],
    opportunityGoals: "Qualified client projects, retainers, speaking or partnership requests in Tunisia.",
    opportunityKeywords: ["projet", "devis", "mission", "collaboration", "partenariat", "budget", "offre"],
    minDealBudgetMillimes: 300_000,
    services: [
      {
        title: "Session Découverte / Consultation",
        category: "consultation",
        description: "Session dédiée pour cadrer le besoin, définir le périmètre et proposer un plan d'action.",
        deliverables: ["Diagnostic du besoin", "Proposition détaillée écrite"],
        duration_label: "45 min",
        price_millimes: 120_000,
        price_display: "120DT",
        floor_millimes: 100_000,
        pricing_mode: "fixed",
        intake_questions: ["Nom complet", "Numéro WhatsApp (+216)", "Objectif principal", "Disponibilité"],
        prep_or_details_template:
          "Session Découverte (120DT · 45 min, en ligne ou sur Tunis). Nous confirmons votre créneau dès réception de vos disponibilités.",
      },
    ],
    sampleOpportunities: [
      {
        source: "board",
        title: "Mission Accompagnement Projet — PME Tunis",
        brand_or_client: "PME Tunisienne",
        category: "partnership",
        description: "Recherche prestataire indépendant pour accompagnement mensuel à Tunis.",
        compensation_text: "1,000 DT / mois",
        budget_millimes: 1_000_000,
        fit_score: 80,
        urgency: "medium",
        fit_reasons: ["Matches independent consulting goal in Tunis", "Budget meets minimum floor"],
        draft_pitch:
          "Bonjour, votre besoin d'accompagnement sur Tunis correspond bien à mes prestations. Je serais ravi d'échanger 15 min pour cadrer vos objectifs.",
      },
    ],
    sampleAlert: {
      severity: "important",
      category: "opportunity_match",
      title: "New qualified opportunity matched (80% fit)",
      summary: "A Tunis SME posted a 1,000 DT/month project brief matching your goals.",
      recommended_action: "Customize your services & goals, then review the brief in Opportunities.",
      draft_reply: "Bonjour, je suis intéressé par votre mission sur Tunis. Quand pouvons-nous en discuter ?",
    },
    welcomeBriefing: {
      headline: "Your custom professional desk is live.",
      highlights: [
        "Starter service & intake questions ready to customize",
        "DM style clone & opportunity radar active for Tunisia (Derja / FR / AR / EN)",
      ],
      actionItems: [
        "Edit your services & rates in Services",
        "Add your style examples & opportunity goals in My Style & AI",
      ],
    },
  },
};

export function getProPreset(category?: string | null): ProPresetPack {
  if (category && category in PRO_PRESETS) {
    return PRO_PRESETS[category as ProCategory];
  }
  return PRO_PRESETS.custom;
}
