package valeriy

import (
	"github.com/genshinsim/gcsim/pkg/core/attributes"
	"github.com/genshinsim/gcsim/pkg/core/player/shield"
)

// need to rewrite Expires
type shd struct {
	*shield.Tmpl
}

func (c *char) addShield() {
	shieldHP := skillShieldAtk[c.TalentLvlSkill()]*c.TotalAtk() + skillShieldFlat[c.TalentLvlSkill()]
	c.skillShield = &shd{
		Tmpl: &shield.Tmpl{
			ActorIndex: c.Index(),
			Target:     -1,
			Src:        c.Core.F,
			Name:       "Valeriy Skill",
			ShieldType: shield.ValeriySkill,
			HP:         shieldHP,
			Ele:        attributes.Electro,
			Expires:    c.Core.F + skillDur,
		},
	}
	c.Core.Player.Shields.Add(c.skillShield)
}
