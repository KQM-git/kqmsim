package breezebornerefrain

import (
	"fmt"
	"math"
	"testing"

	_ "github.com/genshinsim/gcsim/internal/characters/amber"
	_ "github.com/genshinsim/gcsim/internal/characters/diona"
	_ "github.com/genshinsim/gcsim/internal/characters/fischl"
	_ "github.com/genshinsim/gcsim/internal/characters/lisa"
	"github.com/genshinsim/gcsim/pkg/core"
	"github.com/genshinsim/gcsim/pkg/core/attacks"
	"github.com/genshinsim/gcsim/pkg/core/attributes"
	"github.com/genshinsim/gcsim/pkg/core/event"
	"github.com/genshinsim/gcsim/pkg/core/info"
	"github.com/genshinsim/gcsim/pkg/core/keys"
	"github.com/genshinsim/gcsim/pkg/core/player/character"
	"github.com/genshinsim/gcsim/pkg/testhelper"
)

func init() {
	testhelper.RegisterTestWeapon()
}

type testTeam struct {
	core *core.Core
}

func newTestTeam(t *testing.T, order []keys.Char, refines map[keys.Char]int) *testTeam {
	t.Helper()
	c, err := core.New(core.Opt{Seed: 1})
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range order {
		weapon, refine := testhelper.TestWeaponKey, 1
		if r, ok := refines[key]; ok {
			weapon, refine = keys.BreezeborneRefrain, r
		}
		p := testhelper.DefaultProfile(key, weapon)
		p.Weapon.Refine, p.Weapon.Level, p.Weapon.MaxLevel = refine, 90, 90
		if _, err := c.AddChar(p); err != nil {
			t.Fatal(err)
		}
	}
	active, _ := c.Player.ByKey(keys.Lisa)
	c.Player.SetActive(active.Index())
	if err := c.Init(); err != nil {
		t.Fatal(err)
	}
	return &testTeam{core: c}
}

func (team *testTeam) char(key keys.Char) *character.CharWrapper {
	ch, _ := team.core.Player.ByKey(key)
	return ch
}

func (team *testTeam) hit(frame int, actor keys.Char, tag attacks.AttackTag) {
	team.core.F = frame
	team.core.Events.Emit(event.OnEnemyHit, nil, &info.AttackEvent{
		Info: info.AttackInfo{ActorIndex: team.char(actor).Index(), AttackTag: tag},
	})
}

func (team *testTeam) proc(frame int, actor keys.Char) {
	team.hit(frame, actor, attacks.AttackTagElementalArt)
	team.hit(frame+3, actor, attacks.AttackTagElementalArtHold)
	team.hit(frame+6, actor, attacks.AttackTagElementalBurst)
}

func assertNear(t *testing.T, label string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-9 {
		t.Fatalf("%s: got %.12f, want %.12f", label, got, want)
	}
}

func (team *testTeam) assertBonus(t *testing.T, want float64) {
	t.Helper()
	for _, ch := range team.core.Player.Chars() {
		for _, tag := range []attacks.AttackTag{
			attacks.AttackTagDirectStellarConduct,
			attacks.AttackTagDirectStellarSwirl,
			attacks.AttackTagReactionStellarSwirl,
		} {
			got := ch.ReactBonus(info.AttackInfo{AttackTag: tag})
			assertNear(t, ch.Base.Key.String()+" Stellar bonus", got, want)
		}
		got := ch.ReactBonus(info.AttackInfo{AttackTag: attacks.AttackTagElementalArt})
		assertNear(t, ch.Base.Key.String()+" ordinary damage", got, 0)
	}
}

func (team *testTeam) assertER(t *testing.T, key keys.Char, want float64) {
	t.Helper()
	holder := team.char(key)
	got := holder.Stat(attributes.ER) - holder.BaseStats[attributes.ER]
	assertNear(t, key.String()+" permanent ER", got, want)
}

func TestNoBonusBeforeProcAndPartyRegistrationOrder(t *testing.T) {
	for refine := 1; refine <= 5; refine++ {
		for slot := range 4 {
			t.Run(fmt.Sprintf("R%d/holder_slot_%d", refine, slot+1), func(t *testing.T) {
				order := []keys.Char{keys.Fischl, keys.Diona, keys.Amber, keys.Lisa}
				order[0], order[slot] = order[slot], order[0]
				team := newTestTeam(t, order, map[keys.Char]int{keys.Fischl: refine})
				team.assertBonus(t, 0)
				team.assertER(t, keys.Fischl, 0.15+0.05*float64(refine))
				team.proc(10, keys.Fischl)
				team.assertBonus(t, 0.18+0.06*float64(refine))
			})
		}
	}
}

func TestProcFiltersDurationAndRetrigger(t *testing.T) {
	team := newTestTeam(t,
		[]keys.Char{keys.Fischl, keys.Diona, keys.Amber, keys.Lisa},
		map[keys.Char]int{keys.Fischl: 5})
	holder := team.char(keys.Fischl)
	team.assertBonus(t, 0)
	team.hit(1, keys.Lisa, attacks.AttackTagElementalArt)
	team.hit(4, keys.Fischl, attacks.AttackTagDirectStellarConduct)
	team.hit(7, keys.Fischl, attacks.AttackTagNormal)
	team.hit(10, keys.Fischl, attacks.AttackTagElementalArt)
	team.assertBonus(t, 0)

	// Status lookup includes the expiry frame, so both of these hits are blocked.
	team.hit(11, keys.Fischl, attacks.AttackTagElementalBurst)
	team.hit(12, keys.Fischl, attacks.AttackTagElementalArt)
	team.assertBonus(t, 0)
	team.hit(13, keys.Fischl, attacks.AttackTagElementalArtHold)
	team.assertBonus(t, 0)
	team.hit(16, keys.Fischl, attacks.AttackTagElementalBurst)
	team.assertBonus(t, 0.48)
	if got := holder.StatusExpiry(viperKey); got != 736 {
		t.Fatalf("proc expiry: got %d, want 736", got)
	}

	team.hit(100, keys.Fischl, attacks.AttackTagElementalArt)
	team.hit(400, keys.Fischl, attacks.AttackTagElementalBurst)
	team.hit(735, keys.Fischl, attacks.AttackTagElementalArt)
	if got := holder.StatusExpiry(viperKey); got != 736 {
		t.Fatalf("hits during the buff refreshed its expiry to %d", got)
	}
	team.core.F = 736
	team.assertBonus(t, 0.48)
	team.core.F = 737
	team.assertBonus(t, 0)
	team.assertER(t, keys.Fischl, 0.4)

	team.hit(737, keys.Fischl, attacks.AttackTagElementalArt)
	team.assertBonus(t, 0)
	team.hit(740, keys.Fischl, attacks.AttackTagElementalArt)
	team.assertBonus(t, 0)
	team.hit(743, keys.Fischl, attacks.AttackTagElementalBurst)
	team.assertBonus(t, 0.48)
}

func TestMultipleHoldersUseStrongestActiveBonus(t *testing.T) {
	for _, refines := range [][2]int{{5, 1}, {1, 5}, {5, 5}, {1, 1}} {
		for _, reverse := range []bool{false, true} {
			t.Run(fmt.Sprintf("R%d_R%d/reverse_%v", refines[0], refines[1], reverse), func(t *testing.T) {
				order := []keys.Char{keys.Fischl, keys.Diona, keys.Amber, keys.Lisa}
				if reverse {
					order[0], order[1] = order[1], order[0]
				}
				team := newTestTeam(t, order,
					map[keys.Char]int{keys.Fischl: refines[0], keys.Diona: refines[1]})
				firstBonus := 0.18 + 0.06*float64(refines[0])
				secondBonus := 0.18 + 0.06*float64(refines[1])
				team.assertBonus(t, 0)

				// An idle second copy must not suppress an active first copy.
				team.proc(10, keys.Fischl)
				team.assertBonus(t, firstBonus)
				if team.char(keys.Diona).StatusIsActive(viperKey) {
					t.Fatal("one holder activated the other holder's proc")
				}

				// The second holder can build its own stacks while the first is active.
				team.hit(20, keys.Diona, attacks.AttackTagElementalArt)
				team.hit(21, keys.Diona, attacks.AttackTagElementalBurst)
				team.hit(23, keys.Diona, attacks.AttackTagElementalArtHold)
				team.assertBonus(t, firstBonus)
				team.hit(26, keys.Diona, attacks.AttackTagElementalBurst)
				if !team.char(keys.Diona).StatusIsActive(viperKey) {
					t.Fatal("the second holder could not proc independently")
				}
				team.assertBonus(t, max(firstBonus, secondBonus))

				// Preserve the later copy's window when the first copy expires.
				team.core.F = 736
				team.assertBonus(t, max(firstBonus, secondBonus))
				team.core.F = 737
				team.assertBonus(t, secondBonus)
				team.core.F = 746
				team.assertBonus(t, secondBonus)
				team.core.F = 747
				team.assertBonus(t, 0)
				team.assertER(t, keys.Fischl, 0.15+0.05*float64(refines[0]))
				team.assertER(t, keys.Diona, 0.15+0.05*float64(refines[1]))
			})
		}
	}
}

func TestBuffDurationUsesHolderHitlag(t *testing.T) {
	team := newTestTeam(t,
		[]keys.Char{keys.Fischl, keys.Diona, keys.Amber, keys.Lisa},
		map[keys.Char]int{keys.Fischl: 5})
	holder := team.char(keys.Fischl)
	team.proc(10, keys.Fischl)
	team.core.F = 100

	// Hitlag on a recipient must not extend the holder's team buff.
	team.core.Player.ApplyHitlag(team.char(keys.Lisa).Index(), 0, 6)
	if got := holder.StatusExpiry(viperKey); got != 736 {
		t.Fatalf("recipient hitlag changed the holder's expiry to %d", got)
	}

	team.core.Player.SetActive(holder.Index())
	team.core.Player.ApplyHitlag(holder.Index(), 0, 6)
	if got := holder.StatusExpiry(viperKey); got != 742 {
		t.Fatalf("holder hitlag expiry: got %d, want 742", got)
	}
	team.core.F = 737
	team.assertBonus(t, 0.48)
	team.core.F = 743
	team.assertBonus(t, 0)
}
