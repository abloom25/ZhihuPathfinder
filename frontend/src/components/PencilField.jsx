// 手绘描边输入框：textarea/input 不能挂伪元素，
// 用外壳携带与其他元素一致的铅笔滤镜描边，内部输入区透明无边。
export function PencilTextarea(props) {
  return (
    <div className="input-frame">
      <textarea className="custom-input" {...props} />
    </div>
  )
}

export function PencilInput(props) {
  return (
    <div className="input-frame">
      <input type="text" className="custom-input" {...props} />
    </div>
  )
}
