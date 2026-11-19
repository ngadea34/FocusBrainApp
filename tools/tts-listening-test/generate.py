"""Génère les extraits du test d'écoute à l'aveugle (Google Neural2, Google Chirp 3 HD, ElevenLabs).

Aucune clé dans ce script : en session cloud, le proxy ajoute les en-têtes
d'authentification (X-Goog-Api-Key, xi-api-key) aux requêtes vers ces hôtes.
Usage : python3 generate.py <dossier_sortie>
"""
import base64
import json
import pathlib
import sys
import urllib.request

HERE = pathlib.Path(__file__).parent
EXTRAITS = json.loads((HERE / "extraits.json").read_text(encoding="utf-8"))

# Voix féminines partout, pour que le genre ne biaise pas la comparaison.
GOOGLE = {
    "google-neural2": {"fr-FR": "fr-FR-Neural2-F", "en-GB": "en-GB-Neural2-F"},
    "google-chirp3hd": {"fr-FR": "fr-FR-Chirp3-HD-Aoede", "en-GB": "en-GB-Chirp3-HD-Aoede"},
}
ELEVEN_VOICE = "Xb7hH8MSUJpSbSDYk0k2"  # « Alice », voix prédéfinie, même voix dans les deux langues
ELEVEN_MODEL = "eleven_multilingual_v2"

# extrait -> (clé du texte, débit Google, vitesse ElevenLabs)
PLAN = {
    "1-chaleureux-lent": ("1-chaleureux-lent", 0.9, 0.9),
    "2-dense-technique": ("2-dense-technique", 1.0, 1.0),
    "3-documentaire-citation": ("3-documentaire-citation", 1.0, 1.0),
    "4-rapide": ("1-chaleureux-lent", 1.15, 1.15),
}


def post(url: str, payload: dict, accept_json: bool) -> bytes:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def google(voice: str, locale: str, text: str, rate: float) -> bytes:
    body = {"input": {"text": text}, "voice": {"languageCode": locale, "name": voice},
            "audioConfig": {"audioEncoding": "MP3", "speakingRate": rate}}
    out = json.loads(post("https://texttospeech.googleapis.com/v1/text:synthesize", body, True))
    return base64.b64decode(out["audioContent"])


def eleven(locale: str, text: str, speed: float) -> bytes:
    body = {"text": text, "model_id": ELEVEN_MODEL, "language_code": locale.split("-")[0],
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "speed": speed}}
    return post(f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE}?output_format=mp3_44100_128", body, False)


def main(out_dir: str) -> None:
    out = pathlib.Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for locale, texts in EXTRAITS.items():
        for name, (key, g_rate, e_speed) in PLAN.items():
            text = texts[key]
            for provider, voices in GOOGLE.items():
                (out / f"{provider}_{locale}_{name}.mp3").write_bytes(google(voices[locale], locale, text, g_rate))
                print("ok", provider, locale, name)
            (out / f"elevenlabs_{locale}_{name}.mp3").write_bytes(eleven(locale, text, e_speed))
            print("ok elevenlabs", locale, name)


if __name__ == "__main__":
    main(sys.argv[1])
