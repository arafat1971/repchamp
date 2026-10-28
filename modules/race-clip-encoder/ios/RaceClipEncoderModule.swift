import AVFoundation
import ExpoModulesCore
import UIKit

public class RaceClipEncoderModule: Module {
  private var session: EncoderSession?
  private let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("RaceClipEncoder")

    AsyncFunction("start") { (width: Int, height: Int, fps: Int, bitrate: Int) in
      self.lock.lock()
      defer { self.lock.unlock() }
      self.session?.cancel()
      self.session = nil
      let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("race-clip-\(Int(Date().timeIntervalSince1970 * 1000)).mp4")
      self.session = try EncoderSession(url: url, width: width, height: height, fps: fps, bitrate: bitrate)
    }

    AsyncFunction("appendFrame") { (base64Jpeg: String) in
      self.lock.lock()
      defer { self.lock.unlock() }
      guard let open = self.session else { throw NoClipException() }
      try open.append(base64Jpeg: base64Jpeg)
    }

    AsyncFunction("finish") { () async throws -> String in
      self.lock.lock()
      let open = self.session
      self.session = nil
      self.lock.unlock()
      guard let open else { throw NoClipException() }
      return try await open.finish().absoluteString
    }

    AsyncFunction("cancel") {
      self.lock.lock()
      defer { self.lock.unlock() }
      self.session?.cancel()
      self.session = nil
    }
  }
}

final class NoClipException: Exception, @unchecked Sendable {
  override var reason: String { "No race clip is open; call start first." }
}

final class BadFrameException: Exception, @unchecked Sendable {
  override var reason: String { "A frame could not be decoded or appended." }
}

/// H.264 through AVAssetWriter. Frame n is stamped n / fps, so the clip plays at
/// exactly `fps` however long encoding took.
private final class EncoderSession {
  let url: URL
  private let writer: AVAssetWriter
  private let input: AVAssetWriterInput
  private let adaptor: AVAssetWriterInputPixelBufferAdaptor
  private let width: Int
  private let height: Int
  private let fps: Int32
  private var frame: Int64 = 0

  init(url: URL, width: Int, height: Int, fps: Int, bitrate: Int) throws {
    self.url = url
    self.width = width
    self.height = height
    self.fps = Int32(fps)
    try? FileManager.default.removeItem(at: url)
    writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    input = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: bitrate,
        AVVideoMaxKeyFrameIntervalKey: fps,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ],
    ])
    input.expectsMediaDataInRealTime = false
    adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
    ])
    writer.add(input)
    guard writer.startWriting() else { throw writer.error ?? BadFrameException() }
    writer.startSession(atSourceTime: .zero)
  }

  func append(base64Jpeg: String) throws {
    guard
      let data = Data(base64Encoded: base64Jpeg),
      let image = UIImage(data: data)?.cgImage,
      let pool = adaptor.pixelBufferPool
    else { throw BadFrameException() }

    var maybeBuffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, pool, &maybeBuffer)
    guard let buffer = maybeBuffer else { throw BadFrameException() }

    CVPixelBufferLockBaseAddress(buffer, [])
    let context = CGContext(
      data: CVPixelBufferGetBaseAddress(buffer),
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
    )
    context?.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    CVPixelBufferUnlockBaseAddress(buffer, [])
    guard context != nil else { throw BadFrameException() }

    // Not real-time, so the writer can ask us to wait; it never drops a frame.
    let deadline = Date().addingTimeInterval(3)
    while !input.isReadyForMoreMediaData {
      if Date() > deadline || writer.status != .writing { throw BadFrameException() }
      Thread.sleep(forTimeInterval: 0.005)
    }
    guard adaptor.append(buffer, withPresentationTime: CMTime(value: frame, timescale: fps)) else {
      throw writer.error ?? BadFrameException()
    }
    frame += 1
  }

  func finish() async throws -> URL {
    input.markAsFinished()
    await writer.finishWriting()
    if writer.status != .completed { throw writer.error ?? BadFrameException() }
    return url
  }

  func cancel() {
    if writer.status == .writing { writer.cancelWriting() }
    try? FileManager.default.removeItem(at: url)
  }
}
