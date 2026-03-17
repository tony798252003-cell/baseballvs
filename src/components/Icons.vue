<script>
import { h } from 'vue'

export const PlayIcon = {
  props: {
    size: { type: Number, default: 24 },
    fill: { type: Boolean, default: false }
  },
  render() {
    return h('svg', {
      width: this.size,
      height: this.size,
      viewBox: '0 0 24 24',
      fill: this.fill ? 'currentColor' : 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('polygon', { points: '5 3 19 12 5 21 5 3' })
    ])
  }
}

export const RotateCcwIcon = {
  props: { size: { type: Number, default: 24 } },
  render() {
    return h('svg', {
      width: this.size,
      height: this.size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }),
      h('path', { d: 'M3 3v5h5' })
    ])
  }
}

export const UsersIcon = {
  props: { size: { type: Number, default: 24 } },
  render() {
    return h('svg', {
      width: this.size,
      height: this.size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }),
      h('circle', { cx: '9', cy: '7', r: '4' }),
      h('path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87' }),
      h('path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' })
    ])
  }
}

export const SettingsIcon = {
  props: { size: { type: Number, default: 24 } },
  render() {
    return h('svg', {
      width: this.size,
      height: this.size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('circle', { cx: '12', cy: '12', r: '3' }),
      h('path', { d: 'M12 1v6m0 6v6m5.5-9v6m-11-6v6' })
    ])
  }
}

export const Volume2Icon = {
  props: { size: { type: Number, default: 24 } },
  render() {
    return h('svg', {
      width: this.size,
      height: this.size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }),
      h('path', { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' })
    ])
  }
}

export const VolumeXIcon = {
  props: { size: { type: Number, default: 24 } },
  render() {
    return h('svg', {
      width: this.size,
      height: this.size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }),
      h('line', { x1: '23', y1: '9', x2: '17', y2: '15' }),
      h('line', { x1: '17', y1: '9', x2: '23', y2: '15' })
    ])
  }
}

export const ActivityIcon = {
  props: { size: { type: Number, default: 24 } },
  render() {
    return h('svg', {
      width: this.size,
      height: this.size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('polyline', { points: '22 12 18 12 15 21 9 3 6 12 2 12' })
    ])
  }
}

export const TrophyIcon = {
  props: { size: { type: Number, default: 24 } },
  render() {
    return h('svg', {
      width: this.size,
      height: this.size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('path', { d: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6' }),
      h('path', { d: 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18' }),
      h('path', { d: 'M4 22h16' }),
      h('path', { d: 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22' }),
      h('path', { d: 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22' }),
      h('path', { d: 'M18 2H6v7a6 6 0 0 0 12 0V2Z' })
    ])
  }
}

export const XCircleIcon = {
  props: { size: { type: Number, default: 24 } },
  render() {
    return h('svg', {
      width: this.size,
      height: this.size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('circle', { cx: '12', cy: '12', r: '10' }),
      h('line', { x1: '15', y1: '9', x2: '9', y2: '15' }),
      h('line', { x1: '9', y1: '9', x2: '15', y2: '15' })
    ])
  }
}

export const InfoIcon = {
  props: { size: { type: Number, default: 24 } },
  render() {
    return h('svg', {
      width: this.size,
      height: this.size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2'
    }, [
      h('circle', { cx: '12', cy: '12', r: '10' }),
      h('line', { x1: '12', y1: '16', x2: '12', y2: '12' }),
      h('line', { x1: '12', y1: '8', x2: '12.01', y2: '8' })
    ])
  }
}
</script>
