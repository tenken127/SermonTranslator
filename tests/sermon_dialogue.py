"""Standalone prescripted sermon dialogue & translation fixture for offline testing.

Zero external dependencies (Python 3.7+ standard library only).
"""

import base64
import json
import math
import struct
from typing import Dict, List, Optional

SERMON_METADATA = {
    "title": "The Good Shepherd & Unshakable Grace",
    "speaker": "Pastor Carlos",
    "scripture": "Psalm 23; Romans 8:38-39",
    "key_terms": "Agape, Sanctification, Shepherd, Grace, Salvation",
    "context": "Sunday bilingual service; preserve theological terms and reverent tone.",
    "source_lang": "es",
}

# Prescripted multi-segment sermon replicating a live service
SERMON_SCRIPT: List[Dict] = [
    {
        "id": 1,
        "phase": "Greeting",
        "delay_sec": 2.0,
        "source_lang": "es",
        "source_text": "Bienvenidos a la casa del Señor en esta mañana bendecida.",
        "translations": {
            "en": "Welcome to the house of the Lord on this blessed morning.",
            "pt": "Bem-vindos à casa do Senhor nesta manhã abençoada.",
            "fr": "Bienvenue dans la maison du Seigneur en ce matin béni.",
            "ht": "Byenveni nan kay Senyè a nan maten beni sa a.",
        },
    },
    {
        "id": 2,
        "phase": "Scripture Reading",
        "delay_sec": 3.0,
        "source_lang": "es",
        "source_text": "Abran sus Biblias en el Salmo veintitrés, versículo uno.",
        "translations": {
            "en": "Open your Bibles to Psalm twenty-three, verse one.",
            "pt": "Abram suas Bíblias no Salmo vinte e três, versículo um.",
            "fr": "Ouvrez vos Bibles au Psaume vingt-trois, verset un.",
            "ht": "Louvri Bib nou yo nan Sòm venntwa, vèsè en.",
        },
    },
    {
        "id": 3,
        "phase": "Scripture",
        "delay_sec": 3.0,
        "source_lang": "es",
        "source_text": "El Señor es mi pastor; nada me faltará.",
        "translations": {
            "en": "The Lord is my shepherd; I shall not want.",
            "pt": "O Senhor é o meu pastor; nada me faltará.",
            "fr": "L'Éternel est mon berger: je ne manquerai de rien.",
            "ht": "Senyè a se bèje mwen; mwen p'ap manke anyen.",
        },
    },
    {
        "id": 4,
        "phase": "Theology / Teaching",
        "delay_sec": 3.5,
        "source_lang": "es",
        "source_text": "El amor ágape de Dios nos sostiene aun en el valle de sombra.",
        "translations": {
            "en": "The agape love of God sustains us even in the valley of shadow.",
            "pt": "O amor ágape de Deus nos sustenta até no vale da sombra.",
            "fr": "L'amour agapè de Dieu nous soutient même dans la vallée de l'ombre.",
            "ht": "Lanmou agape Bondye a soutni nou menm nan fon lonbraj la.",
        },
    },
    {
        "id": 5,
        "phase": "Theology / Teaching",
        "delay_sec": 3.5,
        "source_lang": "es",
        "source_text": "La santificación es una obra diaria del Espíritu Santo en nosotros.",
        "translations": {
            "en": "Sanctification is a daily work of the Holy Spirit within us.",
            "pt": "A santificação é uma obra diária do Espírito Santo em nós.",
            "fr": "La sanctification est une œuvre quotidienne du Saint-Esprit en nous.",
            "ht": "Sanktifikasyon se yon travay chak jou Sentespri a fè nan nou.",
        },
    },
    {
        "id": 6,
        "phase": "Scripture",
        "delay_sec": 3.5,
        "source_lang": "es",
        "source_text": "Nada nos podrá separar del amor de Dios que es en Cristo Jesús.",
        "translations": {
            "en": "Nothing will be able to separate us from the love of God that is in Christ Jesus.",
            "pt": "Nada poderá nos separar do amor de Deus que está em Cristo Jesus.",
            "fr": "Rien ne pourra nous séparer de l'amour de Dieu qui est en Jésus-Christ.",
            "ht": "Anyen p'ap ka separe nou ak lanmou Bondye ki nan Kris Jezi a.",
        },
    },
    {
        "id": 7,
        "phase": "Application",
        "delay_sec": 3.0,
        "source_lang": "es",
        "source_text": "Por gracia sois salvos por medio de la fe, no por obras.",
        "translations": {
            "en": "By grace you are saved through faith, not by works.",
            "pt": "Pela graça sois salvos por meio da fé, não por obras.",
            "fr": "C'est par la grâce que vous êtes sauvés, par le moyen de la foi, et non par les œuvres.",
            "ht": "Se grasa favè Bondye nou sove pa mwayen lafwa, se pa poutèt zèv nou.",
        },
    },
    {
        "id": 8,
        "phase": "Exhortation",
        "delay_sec": 3.0,
        "source_lang": "es",
        "source_text": "Caminemos con fe y esperanza durante toda esta semana.",
        "translations": {
            "en": "Let us walk in faith and hope throughout this entire week.",
            "pt": "Caminhemos com fé e esperança durante toda esta semana.",
            "fr": "Marchons avec foi et espérance tout au long de cette semaine.",
            "ht": "Ann mache ak lafwa ak esperans pandan tout semèn sa a.",
        },
    },
    {
        "id": 9,
        "phase": "Prayer",
        "delay_sec": 2.5,
        "source_lang": "es",
        "source_text": "Inclinemos nuestros rostros en oración al Padre celestial.",
        "translations": {
            "en": "Let us bow our heads in prayer to the heavenly Father.",
            "pt": "Inclinemos nossas cabeças em oração ao Pai celestial.",
            "fr": "Inclinons nos têtes en prière devant le Père céleste.",
            "ht": "Ann bese tèt nou nan lapriyè devan Papa nou ki nan syèl la.",
        },
    },
    {
        "id": 10,
        "phase": "Benediction",
        "delay_sec": 2.0,
        "source_lang": "es",
        "source_text": "La gracia y la paz de Cristo sean con todos ustedes. Amén.",
        "translations": {
            "en": "The grace and peace of Christ be with you all. Amen.",
            "pt": "A graça e a paz de Cristo sejam com todos vocês. Amém.",
            "fr": "Que la grâce et la paix du Christ soient avec vous tous. Amen.",
            "ht": "Se pou favè ak lapè Kris la avèk nou tout. Amèn.",
        },
    },
]


def lookup_translation(text: str, target_lang: str = "en") -> str:
    """Return prescripted translation for a sermon line, or a deterministic mock fallback."""
    clean = (text or "").strip()
    lang = (target_lang or "en").lower()
    for seg in SERMON_SCRIPT:
        if seg["source_text"].strip().lower() == clean.lower():
            translations = seg["translations"]
            if lang in translations:
                return translations[lang]
            return translations.get("en", clean)
    return "[MOCK {}] {}".format(lang.upper(), clean)


def generate_pcm16_tone_base64(
    duration_ms: int = 250,
    freq_hz: float = 440.0,
    sample_rate: int = 24000,
    amplitude: float = 0.15,
) -> str:
    """Generate a clean 16-bit little-endian PCM sine tone with smooth fade-in/out."""
    num_samples = max(2, int(sample_rate * (duration_ms / 1000.0)))
    fade_samples = min(int(sample_rate * 0.015), num_samples // 4)
    buf = bytearray()
    for i in range(num_samples):
        env = 1.0
        if fade_samples > 0:
            if i < fade_samples:
                env = i / float(fade_samples)
            elif i >= num_samples - fade_samples:
                env = (num_samples - 1 - i) / float(fade_samples)
        sample = int(32767 * amplitude * env * math.sin(2.0 * math.pi * freq_hz * i / sample_rate))
        buf.extend(struct.pack("<h", sample))
    return base64.b64encode(bytes(buf)).decode("ascii")


def to_json() -> str:
    """Serialize metadata and prescripted sermon script to JSON."""
    return json.dumps({"metadata": SERMON_METADATA, "segments": SERMON_SCRIPT}, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    print(to_json())
