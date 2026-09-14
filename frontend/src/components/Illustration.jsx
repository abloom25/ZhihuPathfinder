import heroImg from '../assets/hero-illustration.png'

// 情境插画：正式资产到位前的占位已由 AI 生成稿替换（主稿第 6 节：
// 插画是独立资产；关键文字仍用真实文字渲染，所以便利贴与标注保留 CSS 实现）。
export default function Illustration() {
  return (
    <figure className="illustration" aria-label="情境插画：清晨窗边的书桌，一个人托腮看着桌上还没来消息的手机">
      <img src={heroImg} alt="" />
      <div className="illustration-note" aria-hidden>
        有些等待
        <br />
        也是在走向
        <br />
        下一个自己
      </div>
      <figcaption className="illustration-tag">情境插画</figcaption>
    </figure>
  )
}
