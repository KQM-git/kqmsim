package valeriy

import "github.com/genshinsim/gcsim/pkg/reactable"

func (c *char) isRadianceSSC() bool {
	return c.StatusIsActive(reactable.PolestarFieldKey)
}
