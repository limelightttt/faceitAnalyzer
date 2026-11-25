"""Match fairness: Elo lag of fresh winning accounts, smurf signs, party spread, stacks, the verdict side."""

from app import fairness
from app.scout.features import PlayerFeatures


def player(name, elo, matches=2500, wr=0.5, kd=1.0, together=(), history=20):
    p = PlayerFeatures(
        player_id=name,
        nickname=name,
        faction="x",
        steam_id=None,
        avatar=None,
        country=None,
        elo=elo,
        level=10,
        activated_at=None,
        lifetime_matches=matches,
        lifetime_win_rate=wr,
        lifetime_kd=kd,
        lifetime_hs=None,
        lifetime_adr=None,
    )
    p.history_matches = history
    for other in together:  # queued together in all of their last matches
        p.history_teammates[other] = history
    return p


def even_team(prefix, elo=2000):
    return [player(f"{prefix}{i}", elo) for i in range(5)]


def test_fresh_winning_account_lags_and_has_smurf_signs():
    smurf = player("smurf", 2100, matches=30, wr=0.8, kd=1.55)
    assert fairness.elo_lag(smurf) == 131  # 80% wins over 30 matches, shrunk toward 50%: +131 Elo
    assert fairness.smurf_signs(smurf) == ["K/D 1.55", "побед 80%", "+37 Elo за матч"]
    veteran = player("vet", 2100, matches=2500, wr=0.56, kd=1.4)
    assert fairness.elo_lag(veteran) == 0 and fairness.smurf_signs(veteran) == []  # converged Elo
    low = player("new", 1300, matches=30, wr=0.8, kd=1.6)
    assert fairness.smurf_signs(low) == []  # an ordinary climb below level 8


def test_even_match_stays_even():
    v = fairness.verdict(fairness.Side(even_team("a"), 2000), fairness.Side(even_team("b"), 2000), 0.5)
    assert v["code"] == "even" and v["label"] == "Равный матч" and v["chance_real"] == 0.5
    assert v["against"] == [] and v["favour"] == []


def test_smurfs_and_a_mixed_stack_make_it_unequal_against_you():
    them = [
        player("s1", 2100, matches=30, wr=0.8, kd=1.55, together=["s2", "low"]),
        player("s2", 2150, matches=45, wr=0.78, kd=1.6, together=["s1", "low"]),
        player("low", 1250, together=["s1", "s2"]),
        player("x", 2000),
        player("y", 2000),
    ]
    v = fairness.verdict(
        fairness.Side(even_team("me"), 2000, exclude={"me0"}), fairness.Side(them, 2000), 0.5
    )
    assert v["code"] == "against" and v["label"] == "НЕРАВНЫЙ МАТЧ — против вас"
    assert v["chance_real"] < 0.45 and v["chance_elo"] == 0.5
    text = " | ".join(v["against"])
    assert "Смурф-признаки у соперников: s1 (30 матчей" in text
    assert "пачка с разбросом 900 Elo" in text
    assert v["them"]["largest_party"] == 3 and v["favour"] == []


def test_stack_against_solo_and_your_own_edge():
    stack = [player(f"p{i}", 2000, together=[f"p{j}" for j in range(5) if j != i]) for i in range(5)]
    v = fairness.verdict(fairness.Side(even_team("me"), 2000), fairness.Side(stack, 2000), None)
    assert v["code"] == "against" and v["against"] == ["Пачка из 5 против соло и дуо"]
    v = fairness.verdict(fairness.Side(stack, 2000), fairness.Side(even_team("b"), 2000), None)
    assert v["code"] == "favour" and v["label"] == "Неравный матч — в вашу пользу"


def test_you_are_never_flagged_on_your_own_side():
    me = player("me", 2100, matches=30, wr=0.8, kd=1.6)
    v = fairness.verdict(
        fairness.Side([me, *even_team("t")[:4]], None, exclude={"me"}),
        fairness.Side(even_team("b"), None),
        None,
    )
    assert v["you"]["smurfs"] == []


def _rows(against, favour, even):
    return [
        {"code": c, "won": False}
        for c, n in (("against", against), ("favour", favour), ("even", even))
        for _ in range(n)
    ]


def test_history_bias_is_an_anomaly_only_when_chance_cannot_explain_it():
    from app.services.fairness import summarize

    slots = {
        "you": 110,
        "them": 150,
    }  # 30 matches: four teammates minus a duo partner sometimes, five opponents
    s = summarize(_rows(9, 1, 20), {"them": 12, "you": 1}, slots)
    assert s["code"] == "anomaly" and s["title"].startswith(
        "АНОМАЛИЯ: смурф-признаки в 8.8 раза чаще у соперников"
    )
    assert s["smurfs"]["p_value"] < 0.01 and "неравных матчей против вас 9, в вашу пользу 1" in s["title"]
    assert s["facts"][0] == "Неравных матчей против вас: 9 из 30 (проиграно 9), в вашу пользу: 1."

    s = summarize(_rows(3, 2, 25), {"them": 3, "you": 2}, slots)
    assert s["code"] == "lean" and "случайно" in s["title"]  # a slight lean on few cases is not an anomaly

    s = summarize(_rows(2, 2, 26), {"them": 2, "you": 2}, slots)
    assert s["code"] == "none"

    s = summarize(_rows(1, 0, 29), {"them": 6, "you": 0}, slots)
    assert s["code"] == "anomaly" and "только у соперников (6), у ваших тиммейтов ни одного" in s["title"]
