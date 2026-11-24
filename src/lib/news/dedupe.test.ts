import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distinctiveTokens, findSameStory } from './dedupe'

const nvidia = {
  title: 'Jensen Huang returns to Taiwan as Nvidia expands supplier base',
  excerpt: 'Nvidia chief executive Jensen Huang arrived in Taipei on Sunday to meet suppliers, his third visit this year.',
  tags: ['Nvidia', 'Jensen Huang', 'Taiwan'],
}

test('a new publisher headline of a story we already wrote is caught', () => {
  assert.equal(findSameStory({ titles: ["Nvidia's Jensen Huang heads back to Taiwan to meet chip suppliers"] }, [nvidia]), nvidia)
  const dowry = {
    title: 'Delhi Police constable suspended after dowry car demand video surfaces',
    excerpt: 'Constable Kuldeep was suspended after a video showed him demanding a car as dowry, police said.',
  }
  assert.equal(findSameStory({ titles: ['Kuldeep, Delhi constable, suspended over dowry car demand'] }, [dowry]), dowry)
  const cop = { title: 'COP31 talks collapse without deal on climate finance', excerpt: 'The COP31 climate summit in Antalya ended without agreement on finance.' }
  assert.equal(findSameStory({ titles: ['Climate finance deal elusive as COP31 ends in Antalya'] }, [cop]), cop)
})

test('different stories that share a company or a place are not blocked', () => {
  assert.equal(findSameStory({ titles: ['Nvidia shares fall 4% after export curbs on AI chips to China'] }, [nvidia]), null)
  const haryana = { title: 'Haryana CM Saini urges stronger local governance for better services', excerpt: 'Chief Minister Nayab Singh Saini asked panchayats to improve services.' }
  assert.equal(findSameStory({ titles: ['Haryana announces new sugarcane price for farmers'] }, [haryana]), null)
  assert.equal(findSameStory({ titles: ['Delhi Police arrest two in Rohini robbery case'] }, [{ title: 'Delhi Police constable suspended over dowry demand' }]), null)
})

test('generic words do not count', () => {
  assert.deepEqual(distinctiveTokens('India government police minister'), [])
  assert.ok(distinctiveTokens('Nvidia Jensen Huang').includes('huang'))
  assert.equal(findSameStory({ titles: [] }, [nvidia]), null)
  assert.equal(findSameStory({ titles: ['Anything'] }, []), null)
})
