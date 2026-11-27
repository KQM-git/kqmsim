package breezebornerefrain

import (
	"github.com/genshinsim/gcsim/pkg/core"
	"github.com/genshinsim/gcsim/pkg/core/attacks"
	"github.com/genshinsim/gcsim/pkg/core/attributes"
	"github.com/genshinsim/gcsim/pkg/core/event"
	"github.com/genshinsim/gcsim/pkg/core/info"
	"github.com/genshinsim/gcsim/pkg/core/player/character"
	"github.com/genshinsim/gcsim/pkg/modifier"
)

const (
	erBufffKey      = "breezeborne-refrain-er"
	viperKey        = "thus-lied-the-viper"
	viperBuffKey    = "thus-lied-the-viper-buff"
	hymnStackICDKey = "hymn-of-the-pure-stack-icd"
)

type Weapon struct {
	Index        int
	stackCounter int
	core         *core.Core
	stellarBuff  float64
}

func (w *Weapon) SetIndex(idx int) { w.Index = idx }

func (w *Weapon) Init() error {
	// NewWeapon runs before the full party exists. Register the team modifier here.
	for _, ch := range w.core.Player.Chars() {
		ch.AddReactBonusMod(character.ReactBonusMod{
			// The permanent modifier must not activate the holder's temporary status.
			Base:   modifier.NewBase(viperBuffKey, -1),
			Amount: w.reactionBonus,
		})
	}
	return nil
}

func (w *Weapon) reactionBonus(ai info.AttackInfo) float64 {
	switch ai.AttackTag {
	case attacks.AttackTagDirectStellarConduct,
		attacks.AttackTagDirectStellarSwirl,
		attacks.AttackTagReactionStellarSwirl:
	default:
		return 0
	}

	// Keep one non-stacking team modifier, but consider every holder's own
	// activation window and refinement instead of whichever holder initialized last.
	var bonus float64
	for _, ch := range w.core.Player.Chars() {
		holder, ok := ch.Equip.Weapon.(*Weapon)
		if ok && ch.StatusIsActive(viperKey) {
			bonus = max(bonus, holder.stellarBuff)
		}
	}
	return bonus
}

func NewWeapon(c *core.Core, char *character.CharWrapper, p info.WeaponProfile) (info.Weapon, error) {
	r := p.Refine
	w := &Weapon{
		core:        c,
		stellarBuff: 0.18 + 0.06*float64(r),
	}

	erBuff := make([]float64, attributes.EndStatType)
	erBuff[attributes.ER] = 0.15 + float64(r)*0.05

	char.AddStatMod(character.StatMod{
		Base: modifier.NewBase(erBufffKey, -1),
		Amount: func() []float64 {
			return erBuff
		},
	})

	onSkillOrBurstHit := func(args ...any) {
		atk, ok := args[1].(*info.AttackEvent)
		if !ok {
			return
		}

		if atk.Info.ActorIndex != char.Index() {
			return
		}

		switch atk.Info.AttackTag {
		case attacks.AttackTagElementalArt:
		case attacks.AttackTagElementalArtHold:
		case attacks.AttackTagElementalBurst:
		default:
			return
		}

		if char.StatusIsActive(viperKey) {
			return
		}

		if char.StatusIsActive(hymnStackICDKey) {
			return
		}

		w.stackCounter++
		char.AddStatus(hymnStackICDKey, 2, true)

		if w.stackCounter < 3 {
			return
		}

		w.stackCounter = 0
		char.AddStatus(viperKey, 12*60, true)
	}

	c.Events.Subscribe(event.OnEnemyHit, onSkillOrBurstHit, "breezeborne-refrain-on-hit-"+char.Base.Key.String())

	return w, nil
}
