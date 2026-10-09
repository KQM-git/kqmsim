package valeriy

import (
	"slices"

	"github.com/genshinsim/gcsim/pkg/core/attacks"
	"github.com/genshinsim/gcsim/pkg/core/attributes"
	"github.com/genshinsim/gcsim/pkg/core/info"
	"github.com/genshinsim/gcsim/pkg/core/player/character"
	"github.com/genshinsim/gcsim/pkg/enemy"
	"github.com/genshinsim/gcsim/pkg/modifier"
)

const (
	c1Key    = "valeriy-c1"
	c1ICDKey = "valeriy-c1-icd"
	c2Key    = "valeriy-c2"
	c4Key    = "valeriy-c4"
	c6Key    = "valeriy-c6"
)

func (c *char) c1SkillMomentumBonus() float64 {
	if c.Base.Cons < 1 {
		return 0
	}

	if c.c1SkillUsed {
		return 0
	}

	c.c1SkillUsed = true
	return 0.5
}

func (c *char) c1OnMomentumConsume(momentum float64) {
	if c.Base.Cons < 1 {
		return
	}

	if c.StatusIsActive(c1ICDKey) {
		return
	}

	c.AddStatus(c1ICDKey, 15*60, true)

	// momentum has to be greater or equal to 40 to use the special CA,
	// so we don't need to make sure momentum is greater than 40 here

	amt := min(6+(momentum-40)/10*1.5, 15)

	c.AddEnergy(c1Key, amt)
}

func (c *char) c2Init() {
	if c.Base.Cons < 2 {
		return
	}
	c.c2Buff = make([]float64, attributes.EndStatType)
	c.c2Buff[attributes.EM] = 100
}

func (c *char) c2OnSkill() {
	if c.Base.Cons < 2 {
		return
	}

	for _, char := range c.Core.Player.Chars() {
		char.AddStatMod(character.StatMod{
			Base:         modifier.NewBaseWithHitlag(c2Key, 15*60),
			AffectedStat: attributes.EM,
			Amount: func() []float64 {
				return c.c2Buff
			},
		})
	}
}

// TODO: add shield bonus HP on excess momentum gain
// func (c *char) c2OnMomentumExcess(momentum float64) {
// 	if c.Base.Cons < 2 {
// 		return
// 	}

// 	shd := c.Core.Player.Shields.Get(shield.ValeriySkill)
// 	if shd == nil {
// 		return
// 	}
// }

func (c *char) c4BonusMaxMomentum() float64 {
	if c.Base.Cons < 4 {
		return 0
	}
	return 30
}

func (c *char) c4BonusMomentum() float64 {
	if c.Base.Cons < 4 {
		return 0
	}
	return 0.3
}

func (c *char) c4a1BonusLimit() float64 {
	if c.Base.Cons < 4 {
		return 0
	}
	return a1Limit * 0.3
}

func (c *char) c6Init() {
	if c.Base.Cons < 6 {
		return
	}

	m := make([]float64, attributes.EndStatType)
	m[attributes.DmgP] = 1
	c.AddAttackMod(character.AttackMod{
		Base: modifier.NewBase(c6Key+"-self", -1),
		Amount: func(atk *info.AttackEvent, _ info.Target) []float64 {
			if !slices.Contains(atk.Info.AdditionalTags, attacks.AttackTagValeriySpecial) {
				return nil
			}

			return m
		},
	})

	m2 := make([]float64, attributes.EndStatType)
	m2[attributes.CR] = 0.1

	for _, char := range c.Core.Player.Chars() {
		char.AddAttackMod(character.AttackMod{
			Base: modifier.NewBase(c6Key, -1),
			Amount: func(atk *info.AttackEvent, t_ info.Target) []float64 {
				if atk.Info.Element != attributes.Electro {
					return nil
				}

				e, ok := t_.(*enemy.Enemy)
				if !ok {
					return nil
				}

				if !e.StatusIsActive(c6Key) {
					return nil
				}

				if atk.Info.AttackTag == attacks.AttackTagDirectStellarConduct {
					m2[attributes.CD] = 0.4
				} else {
					m2[attributes.CD] = 0
				}

				return m2
			},
		})
	}
}

func (c *char) c6CB(ac info.AttackCB) {
	if c.Base.Cons < 6 {
		return
	}

	e, ok := ac.Target.(*enemy.Enemy)
	if !ok {
		return
	}

	e.AddStatus(c6Key, 7*60, true)
}
