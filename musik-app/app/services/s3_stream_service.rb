require "aws-sdk-s3"

class S3StreamService
  def initialize
    @client = Aws::S3::Client.new(
      access_key_id:     ENV["S3_ACCESS_KEY_ID"],
      secret_access_key: ENV["S3_SECRET_ACCESS_KEY"],
      region:            ENV.fetch("AWS_REGION", "us-east-1"),
      endpoint:          ENV["S3_PUBLIC_URL"].presence || ENV["S3_ENDPOINT"],
      force_path_style:  true
    )
    @bucket = ENV["S3_BUCKET"]
  end

  def presigned_url(key, expires_in: 3600)
    Aws::S3::Presigner.new(client: @client)
                      .presigned_url(:get_object, bucket: @bucket, key: key, expires_in: expires_in)
  end
end
