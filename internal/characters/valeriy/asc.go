package valeriy

import (
	"github.com/genshinsim/gcsim/pkg/core/attributes"
	"github.com/genshinsim/gcsim/pkg/core/event"
	"github.com/genshinsim/gcsim/pkg/core/info"
)

const (
	a1Key   = "valeriy-a1"
	a1Limit = 80
	a4Key   = "valeriy-a4"
)

func (c *char) a1OnBurst() {
	if c.Base.Ascension < 1 {
		return
	}

	c.a1Momentum = 0
}

func (c *char) a1Init() {
	if c.Base.Ascension < 1 {
		return
	}

	c.Core.Events.Subscribe(event.OnEnemyHit, func(args ...any) {
		atk := args[1].(*info.AttackEvent)
		if atk.Info.ActorIndex != c.Core.Player.Active() {
			return
		}
		if atk.Info.Element != attributes.Electro {
			return
		}

		if !c.StatusIsActive(burstKey) {
			return
		}

		if c.a1Momentum >= a1Limit+c.c4a1BonusLimit() {
			return
		}

		// assume that when reaching cap, it doesn't take up the 80 limit
		c.a1Momentum += c.addMomentum(5)
	}, a1Key)
}

func (c *char) a4OnMomentumConsume(momentum float64) {
	if c.Base.Ascension < 4 {
		return
	}

	c.a4Momentum = momentum
}

func (c *char) a4BonusSSCScaling() float64 {
	if c.Base.Ascension < 4 {
		return 0
	}

	return 0.009 * c.a4Momentum
}

func (c *char) a4BonusElectroScaling() float64 {
	if c.Base.Ascension < 4 {
		return 0
	}

	return 0.003 * c.a4Momentum
}
