"""AI coach: Claude reads a dossier of already computed facts and writes a review the player can act on.

The model never fetches data itself and every conclusion must cite dossier facts by id; conclusions
without valid evidence are dropped before they reach the player (see review.py).
"""
