import React from 'react';

import SPELLS from 'common/SPELLS';
import Analyzer, { SELECTED_PLAYER } from 'parser/core/Analyzer';
import StatTracker from 'parser/shared/modules/StatTracker';
import { formatNumber, formatPercentage } from 'common/format';
import StatisticGroup from 'interface/statistics/StatisticGroup';
import STATISTIC_CATEGORY from 'interface/others/STATISTIC_CATEGORY';
import ItemStatistic from 'interface/statistics/ItemStatistic';
import SpellLink from 'common/SpellLink';
import HasteIcon from 'interface/icons/Haste';
import UptimeIcon from 'interface/icons/Uptime';
import ItemDamageDone from 'interface/ItemDamageDone';
import Abilities from 'parser/core/modules/Abilities';
import { calculatePrimaryStat } from 'common/stats';
import Events, { EventType } from 'parser/core/Events';

const MINOR_SPELL_IDS = {
  1: SPELLS.FOCUSED_ENERGY_RANK_ONE.id,
  2: SPELLS.FOCUSED_ENERGY_RANK_TWO.id,
  3: SPELLS.FOCUSED_ENERGY_RANK_THREE_FOUR.id,
  4: SPELLS.FOCUSED_ENERGY_RANK_THREE_FOUR.id,
};

const MAJOR_SPELL_IDS = {
  1: SPELLS.ESSENCE_OF_THE_FOCUSING_IRIS.id,
  2: SPELLS.ESSENCE_OF_THE_FOCUSING_IRIS_RANK_TWO.id,
  3: SPELLS.ESSENCE_OF_THE_FOCUSING_IRIS_RANK_THREE_FOUR.id,
  4: SPELLS.ESSENCE_OF_THE_FOCUSING_IRIS_RANK_THREE_FOUR.id,
};

/**
 * Major:
 * Focus excess Azerite energy into the Heart of Azeroth, then expel that energy outward, dealing 92680 Fire damage to all enemies in front of you over 3 sec.
 * Minor:
 Your damaging spells and abilities grant you 17 Haste for 4 sec, stacking up to 10 times. This Haste is lost if you stop using spells or abilities against the initial target.
 * R2: Activation cast time reduced to 1.25 seconds / Haste granted is increased by 50%.
 * R3: You can cast and channel this while moving / When you have no stacks of Focused Energy, gain 3 stacks from your first ability cast on a new target.
 */

class EssenceOfTheFocusingIris extends Analyzer {
  static dependencies = {
    statTracker: StatTracker,
    abilities: Abilities,
  };

  hasteBuff = 0;
  rank = 0;
  majorCastDamage = 0;
  totalHaste = 0;
  currentStacks = 0;
  lastStackTimestamp = 0;

  constructor(...args) {
    super(...args);
    this.active = this.selectedCombatant.hasEssence(SPELLS.ESSENCE_OF_THE_FOCUSING_IRIS.traitId);
    if (!this.active) {
      return;
    }
    this.hasMajor = this.selectedCombatant.hasMajor(SPELLS.ESSENCE_OF_THE_FOCUSING_IRIS.traitId);
    this.rank = this.selectedCombatant.essenceRank(SPELLS.ESSENCE_OF_THE_FOCUSING_IRIS.traitId);
    if (this.hasMajor) {
      this.abilities.add({
        spell: SPELLS.ESSENCE_OF_THE_FOCUSING_IRIS,
        category: Abilities.SPELL_CATEGORIES.ITEMS,
        cooldown: 90,
        gcd: {
          base: 1500,
        },
        castEfficiency: {
          suggestion: true,
          recommendedEfficiency: 0.80,
        },
      });
    }
    if (this.rank < 2) {
      this.hasteBuff = calculatePrimaryStat(477, 25, this.selectedCombatant.neck.itemLevel);
    } else {
      this.hasteBuff = calculatePrimaryStat(505, 40, this.selectedCombatant.neck.itemLevel);
    }
    this.statTracker.add(SPELLS.FOCUSED_ENERGY_BUFF.id, {
      haste: this.hasteBuff,
    });
    this.addEventListener(Events.applybuff.by(SELECTED_PLAYER).spell(SPELLS.FOCUSED_ENERGY_BUFF), this.handleStacks);
    this.addEventListener(Events.removebuff.by(SELECTED_PLAYER).spell(SPELLS.FOCUSED_ENERGY_BUFF), this.handleStacks);
    this.addEventListener(Events.applybuffstack.by(SELECTED_PLAYER).spell(SPELLS.FOCUSED_ENERGY_BUFF), this.handleStacks);
    this.addEventListener(Events.damage.by(SELECTED_PLAYER).spell(SPELLS.FOCUSED_AZERITE_BEAM_DAMAGE), this.onDamage);
    this.addEventListener(Events.fightend, this.handleStacks);
  }

  handleStacks(event) {
    const uptimeOnStack = event.timestamp - this.lastStackTimestamp;
    this.totalHaste += this.currentStacks * this.hasteBuff * uptimeOnStack;

    if (event.type === EventType.ApplyBuff) {
      // With Rank two or above the buff application grants you three stacks instead of 1.
      this.currentStacks = (this.rank >= 2 ? 3 : 1);
    } else if (event.type === EventType.RemoveBuff) {
      this.currentStacks = 0;
    } else {
      this.currentStacks = event.stack;
    }

    this.lastStackTimestamp = event.timestamp;
  }

  get uptime() {
    return this.selectedCombatant.getBuffUptime(SPELLS.FOCUSED_ENERGY_BUFF.id) / this.owner.fightDuration;
  }

  onDamage(event) {
    this.majorCastDamage += event.amount + (event.absorbed || 0);
  }

  get averageHasteGain() {
    return (this.totalHaste / this.owner.fightDuration).toFixed(0);
  }

  statistic() {
    const rank = this.selectedCombatant.essenceRank(SPELLS.ESSENCE_OF_THE_FOCUSING_IRIS.traitId);
    return (
      <StatisticGroup category={STATISTIC_CATEGORY.ITEMS}>
        <ItemStatistic ultrawide>
          <div className="pad">
            <label><SpellLink id={MINOR_SPELL_IDS[rank]} /> - Minor Rank {rank}</label>
            <div className="value">
              <HasteIcon /> {formatNumber(this.averageHasteGain)} <small>average Haste gained</small> <br />
              <UptimeIcon /> {formatPercentage(this.uptime)}% <small>uptime</small>            </div>
          </div>
        </ItemStatistic>
        {this.hasMajor && (
          <ItemStatistic ultrawide>
            <div className="pad">
              <label><SpellLink id={MAJOR_SPELL_IDS[rank]} /> - Major Rank {rank}</label>
              <div className="value">
                <ItemDamageDone amount={this.majorCastDamage} />
              </div>
            </div>
          </ItemStatistic>
        )}
      </StatisticGroup>
    );
  }
}

export default EssenceOfTheFocusingIris;

