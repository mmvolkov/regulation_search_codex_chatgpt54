"""
Simple lemmatizer for Stage 1 (without Natasha).

Provides basic text normalization for BM25 keyword search:
- Lowercasing
- Removing punctuation
- Basic Russian stop-word removal

In Stage 2, this will be replaced with Natasha-based lemmatization.
"""

import re

# Basic Russian stop words (conjunctions, prepositions, particles)
STOP_WORDS = {
    'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то',
    'все', 'она', 'так', 'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за',
    'бы', 'по', 'только', 'ее', 'мне', 'было', 'вот', 'от', 'меня', 'еще',
    'нет', 'о', 'из', 'ему', 'теперь', 'когда', 'даже', 'ну', 'вдруг', 'ли',
    'если', 'уже', 'или', 'ни', 'быть', 'был', 'него', 'до', 'вас', 'нибудь',
    'опять', 'уж', 'вам', 'ведь', 'там', 'потом', 'себя', 'ничего', 'ей',
    'может', 'они', 'тут', 'где', 'есть', 'надо', 'ней', 'для', 'мы', 'тебя',
    'их', 'чем', 'была', 'сам', 'чтоб', 'без', 'будто', 'чего', 'раз',
    'тоже', 'себе', 'под', 'будет', 'ж', 'тогда', 'кто', 'этот', 'того',
    'потому', 'этого', 'какой', 'совсем', 'ним', 'здесь', 'этом', 'один',
    'почти', 'мой', 'тем', 'чтобы', 'нее', 'сейчас', 'были', 'куда',
    'зачем', 'всех', 'никогда', 'можно', 'при', 'наконец', 'два', 'об',
    'другой', 'хоть', 'после', 'над', 'больше', 'тот', 'через', 'эти',
    'нас', 'про', 'всего', 'них', 'какая', 'много', 'разве', 'три',
    'эту', 'моя', 'впрочем', 'хорошо', 'свою', 'этой', 'перед', 'иногда',
    'лучше', 'чуть', 'том', 'нельзя', 'такой', 'им', 'более', 'всегда',
    'конечно', 'всю', 'между', 'также', 'которые', 'который', 'которая',
    'которое', 'которых', 'которому', 'которой', 'которого', 'это', 'эта',
}


def tokenize(text: str) -> list[str]:
    """Tokenize text into words, removing punctuation."""
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text)
    tokens = text.split()
    return [t for t in tokens if t and len(t) > 1]


def remove_stop_words(tokens: list[str]) -> list[str]:
    """Remove stop words from token list."""
    return [t for t in tokens if t not in STOP_WORDS]


def lemmatize_text(text: str) -> str:
    """
    Simple lemmatization for Stage 1.
    Returns space-separated tokens with stop words removed.
    """
    tokens = tokenize(text)
    tokens = remove_stop_words(tokens)
    return " ".join(tokens)
