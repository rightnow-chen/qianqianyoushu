import assert from 'node:assert/strict'
import { CITY_PLACEHOLDER, PROVINCES, citiesOf, composeCity, isKnownProvince, parseCity } from '../../src/features/cities.js'

// 1. 省级必须是完整的 34 个，少一个就有用户选不到自己
assert.equal(PROVINCES.length, 34, `省级行政区应为 34 个，实际 ${PROVINCES.length}`)

const names = PROVINCES.map((item) => item.name)
const must = [
  '北京', '天津', '上海', '重庆',
  '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东',
  '广西', '海南', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
  '台湾', '香港', '澳门',
]
must.forEach((name) => assert.ok(names.includes(name), `缺省级：${name}`))
assert.equal(new Set(names).size, names.length, '省级列表有重复')

// 2. 有地级市的省份，市不能是空的，也不能重复
const withCities = PROVINCES.filter((item) => item.cities.length > 0)
assert.ok(withCities.length >= 27, `应有至少 27 个省份细分到市，实际 ${withCities.length}`)
withCities.forEach((item) => {
  assert.ok(item.cities.length >= 3, `${item.name} 只列了 ${item.cities.length} 个市，太少`)
  assert.equal(new Set(item.cities).size, item.cities.length, `${item.name} 的市有重复`)
})

// 3. 直辖市 / 特别行政区 / 台湾不分市——避免引出不必要的区划表述
;['北京', '天津', '上海', '重庆', '台湾', '香港', '澳门'].forEach((name) => {
  assert.deepEqual(citiesOf(name), [], `${name} 不应再细分到市`)
})

// 4. 抽样：几个大省的关键城市必须在
assert.ok(citiesOf('湖北').includes('武汉'), '湖北必须有武汉')
assert.ok(citiesOf('湖北').includes('恩施'), '湖北要有自治州')
assert.ok(citiesOf('广东').includes('深圳'))
assert.ok(citiesOf('广东').includes('东莞'), '东莞是不设区的地级市，容易漏')
assert.ok(citiesOf('新疆').includes('喀什'))
assert.ok(citiesOf('西藏').includes('阿里'))

// 5. 拼装 / 拆分往返
assert.equal(composeCity('', ''), CITY_PLACEHOLDER, '都没选时是占位值')
assert.equal(composeCity('北京', ''), '北京', '直辖市不能拼出「北京 · 」这种尾巴')
assert.equal(composeCity('湖北', ''), '湖北', '只选到省时就是省名')
assert.equal(composeCity('湖北', '武汉'), '湖北 · 武汉')

assert.deepEqual(parseCity('湖北 · 武汉'), { province: '湖北', city: '武汉' })
assert.deepEqual(parseCity('北京'), { province: '北京', city: '' })
assert.deepEqual(parseCity(CITY_PLACEHOLDER), { province: '', city: '' })
assert.deepEqual(parseCity(''), { province: '', city: '' })

// 6. 旧版本存过区级值，拆出来省还在，界面能兜住
assert.deepEqual(parseCity('北京 · 朝阳'), { province: '北京', city: '朝阳' })
assert.ok(isKnownProvince(parseCity('北京 · 朝阳').province), '旧区级值里的省仍要认得')

// 7. 三字的省会和含「州」的城市不能被截断
assert.equal(composeCity('内蒙古', '锡林郭勒盟'), '内蒙古 · 锡林郭勒盟')
assert.equal(parseCity('内蒙古 · 锡林郭勒盟').city, '锡林郭勒盟')

// 8. 不认识的省要判为未知，让界面落回「待确认」而不是显示空白格
assert.equal(isKnownProvince('深圳'), false, '「深圳」是市不是省')
assert.equal(isKnownProvince('火星'), false)

console.log('cities passed: 34 省级、省市往返、旧值兜底、长名字不截断')
